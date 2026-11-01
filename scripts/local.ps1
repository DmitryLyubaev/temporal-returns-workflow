param(
    [ValidateSet('setup','check','up','down','capture')][string]$Action='check',
    [ValidatePattern('^[a-z0-9_-]{1,48}$')][string]$CaptureId='dev'
)
$ErrorActionPreference='Stop'
$p28Root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $p28Root
New-Item -ItemType Directory -Path '.local' -Force | Out-Null
$p28RootWsl=(& wsl.exe -e wslpath -u $p28Root).Trim()
if($LASTEXITCODE -ne 0 -or -not $p28RootWsl.StartsWith('/')){throw 'WSL path resolution failed'}
$p28Project='p28-'+$CaptureId
$p28Sha=(& git rev-parse HEAD).Trim()
$p28Tag=$p28Sha.Substring(0,12)
if(@(& git status --porcelain).Count -gt 0){$p28Sha='uncommitted-'+$p28Tag;$p28Tag='working-'+$p28Tag}
$p28Deadline='0'
$p28CaptureOverride=$false
$p28Log=Join-Path $p28Root ('.local/driver-'+$Action+'-'+$CaptureId+'.log')

function Invoke-P28Process([string[]]$Arguments,[int]$TimeoutMs=300000){
    $p28Info=[Diagnostics.ProcessStartInfo]::new()
    $p28Info.FileName='wsl.exe';$p28Info.UseShellExecute=$false;$p28Info.CreateNoWindow=$true
    $p28Info.RedirectStandardOutput=$true;$p28Info.RedirectStandardError=$true
    foreach($p28Arg in $Arguments){[void]$p28Info.ArgumentList.Add($p28Arg)}
    $p28Process=[Diagnostics.Process]::new();$p28Process.StartInfo=$p28Info
    [void]$p28Process.Start()
    $p28Stdout=$p28Process.StandardOutput.ReadToEndAsync();$p28Stderr=$p28Process.StandardError.ReadToEndAsync()
    $p28Watch=[Diagnostics.Stopwatch]::StartNew()
    while(-not $p28Process.WaitForExit(1000)){
        if($p28Watch.ElapsedMilliseconds -gt $TimeoutMs){$p28Process.Kill($true);throw 'owned command timed out'}
    }
    $p28Out=$p28Stdout.GetAwaiter().GetResult();$p28Err=$p28Stderr.GetAwaiter().GetResult()
    Add-Content -LiteralPath $p28Log -Value ($p28Out+$p28Err)
    if($p28Process.ExitCode -ne 0){throw ('owned command failed; see '+$p28Log)}
    return $p28Out.TrimEnd()
}
function Invoke-P28Compose([string[]]$Command,[int]$TimeoutMs=300000){
    $p28Args=@('-e','env',"P28_SOURCE_SHA=$p28Sha","P28_SOURCE_TAG=$p28Tag","P28_PROJECT=$p28Project","P28_CAPTURE_ID=$CaptureId","P28_TASK_QUEUE=$p28Project","P28_DEADLINE=$p28Deadline",'docker','compose','--project-name',$p28Project,'--project-directory',$p28RootWsl,'--env-file',"$p28RootWsl/.env",'--file',"$p28RootWsl/compose.yaml")
    if($p28CaptureOverride){$p28Args+=@('--file',"$p28RootWsl/compose.capture.yaml")}
    return Invoke-P28Process ($p28Args+$Command) $TimeoutMs
}
function Assert-P28Ready {
    [void](Invoke-P28Process @('-e','docker','info','--format','{{.ServerVersion}}') 15000)
    $p28Mem=Invoke-P28Process @('-e','cat','/proc/meminfo') 15000
    $p28Available=[double]([regex]::Match($p28Mem,'MemAvailable:\s+(\d+)').Groups[1].Value)/1MB
    $p28Host=Get-CimInstance Win32_OperatingSystem
    $p28Ports=@(5488,7288,8288,8388)
    $p28Busy=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -In $p28Ports | Select-Object -ExpandProperty LocalPort)
    $p28Sockets=Invoke-P28Process @('-e','ss','-H','-ltn') 15000
    foreach($p28Port in $p28Ports){if($p28Sockets -match (':'+$p28Port+'\s')){$p28Busy+= $p28Port}}
    $p28Owned=Invoke-P28Compose @('ps','--all','--quiet') 15000
    if($p28Owned){
        $p28Inspects=Invoke-P28Process (@('-e','docker','inspect')+@($p28Owned -split '\s+')) 15000 | ConvertFrom-Json
        foreach($p28Container in $p28Inspects){
            if($p28Container.Config.Labels.'com.docker.compose.project' -ne $p28Project){throw 'owned inventory mismatch'}
            foreach($p28Binding in $p28Container.NetworkSettings.Ports.PSObject.Properties.Value){
                foreach($p28Bound in $p28Binding){$p28Busy=@($p28Busy | Where-Object {$_ -ne [int]$p28Bound.HostPort})}
            }
        }
    }
    $p28Inventory=@{freeRamGiB=$p28Available;freeHostRamGiB=([double]$p28Host.FreePhysicalMemory/1MB);freeDiskGiB=([double](Get-Item -LiteralPath $p28Root).PSDrive.Free/1GB);busyPorts=@($p28Busy | Sort-Object -Unique)}
    $p28Inventory | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath '.local/preflight.json'
    & node scripts/preflight.cjs .local/preflight.json full
    if($LASTEXITCODE -ne 0){throw 'preflight did not pass; no unrelated processes were stopped'}
}
function Start-P28Infrastructure {
    [void](Invoke-P28Compose @('up','-d','--wait','postgres'))
    [void](Invoke-P28Compose @('up','-d','temporal'))
    [void](Invoke-P28Compose @('run','--rm','tools','node','build/src/db/migrate.js'))
}
if(-not (Test-Path -LiteralPath '.env')){
    $p28Bytes=[byte[]]::new(16);[Security.Cryptography.RandomNumberGenerator]::Fill($p28Bytes)
    ('P28_PASSWORD='+[Convert]::ToHexString($p28Bytes).ToLowerInvariant()) | Set-Content -LiteralPath '.env'
}
switch($Action){
 'down' {[void](Invoke-P28Compose @('down','--timeout','3') 20000);Write-Host 'owned services stopped; volumes retained'}
 'setup' {
    Assert-P28Ready
    [void](Invoke-P28Compose @('pull','postgres','temporal','tools'))
    [void](Invoke-P28Compose @('run','--rm','tools','npm','ci','--no-audit','--no-fund'))
    [void](Invoke-P28Compose @('run','--rm','tools','npm','run','build'))
    New-Item -ItemType Directory -Path '.local/tools' -Force | Out-Null
    $p28Archive='.local/tools/testserver.tar.gz'
    if(-not (Test-Path -LiteralPath $p28Archive)){Invoke-WebRequest -Uri 'https://github.com/temporalio/sdk-java/releases/download/v1.40.0/temporal-test-server_1.40.0_linux_amd64.tar.gz' -OutFile $p28Archive}
    if((Get-FileHash -LiteralPath $p28Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '524465a96274831e004326f6e2f2a5f3ef9aaed72c2069cf16c1d64b8b1ec3ca'){throw 'pinned test-server hash mismatch'}
    [void](Invoke-P28Process @('-e','tar','-xzf',"$p28RootWsl/$p28Archive",'-C',"$p28RootWsl/.local/tools"))
    [void](Invoke-P28Compose @('build','receiver'))
    if(Test-Path -LiteralPath 'build/src/acceptance/replay.js'){[void](Invoke-P28Compose @('run','--rm','tools','node','build/src/acceptance/replay.js','--prepare'))}
    Write-Host 'pinned local setup prepared'
 }
 'check' {
    Assert-P28Ready;Start-P28Infrastructure
    [void](Invoke-P28Compose @('run','--rm','tools','npm','test'))
    [void](Invoke-P28Compose @('run','--rm','-e','P28_REAL=1','tools','node','--test','--test-concurrency=1','build/tests/cancellation.test.js'))
    Write-Host 'software and real-server profiles passed; canonical acceptance is separate'
 }
 'up' {
    Assert-P28Ready;Start-P28Infrastructure
    [void](Invoke-P28Compose @('up','-d','receiver','worker'));Write-Host 'owned local runtime started'
 }
 'capture' {
    if($CaptureId -eq 'dev' -or $p28Sha.StartsWith('uncommitted-')){throw 'capture needs a fresh ID and clean committed source'}
    if(-not (Test-Path -LiteralPath 'build/src/acceptance/run.js')){throw 'acceptance harness is not built'}
    Assert-P28Ready
    $p28Directory=Join-Path $p28Root ('.local/captures/'+$CaptureId)
    if(Test-Path -LiteralPath $p28Directory){throw 'capture already exists; original preserved'}
    New-Item -ItemType Directory -Path $p28Directory -Force | Out-Null
    $p28Clock=[Diagnostics.Stopwatch]::StartNew();$p28Start=[DateTimeOffset]::UtcNow
    $p28Deadline=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+300000).ToString()
    $p28CaptureOverride=$true;$p28Failure=$null;$p28Clean=$false
    try{
        Start-P28Infrastructure
        [void](Invoke-P28Compose @('up','-d','receiver','worker'))
        [void](Invoke-P28Compose @('run','--rm','tools','node','build/src/acceptance/run.js','--capture',$CaptureId) ([Math]::Max(1000,270000-$p28Clock.ElapsedMilliseconds)))
    }catch{$p28Failure=$_.Exception.Message}
    finally{
        try{[void](Invoke-P28Compose @('down','--timeout','3') 20000);$p28Clean=$true}catch{if(-not $p28Failure){$p28Failure='owned cleanup failed'}}
        @{source=$p28Sha;captureId=$CaptureId;startedAt=$p28Start.ToString('o');finishedAt=[DateTimeOffset]::UtcNow.ToString('o');durationMs=$p28Clock.ElapsedMilliseconds;cleanup=$p28Clean;error=$p28Failure;withinDeadline=($p28Clock.ElapsedMilliseconds -le 300000)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $p28Directory 'wrapper.json')
    }
    if($p28Failure){throw $p28Failure}
    Write-Host ('capture finished in '+$p28Clock.ElapsedMilliseconds+'ms including cleanup')
 }
}
