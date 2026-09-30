# Sequential queue for the fine / end-of-line runs (2026-09-25). Reads fine0925\queue.txt each time
# round, so runs can be added while it works: one line per run, "who|preset|bands|mingap". Runs each
# line once, one at a time, on 16 workers, pinned to the fast cores; stops when nothing is left.
(Get-Process -Id $PID).PriorityClass = 'BelowNormal'
$priv = 'C:\Users\cha12\aaap-private'
$dir = "$priv\fine0925"
New-Item -ItemType Directory -Force $dir | Out-Null
$log = "$dir\queue.log"
$done = "$dir\done.txt"
if (-not (Test-Path $done)) { New-Item -ItemType File $done | Out-Null }
function Pin-Cores { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*aaap-*' } | ForEach-Object { try { $p = Get-Process -Id $_.ProcessId; if ($p.ProcessorAffinity -ne 0xFFFF) { $p.ProcessorAffinity = 0xFFFF; $p.PriorityClass = 'BelowNormal' } } catch {} } }
"$(Get-Date -Format s) START fine0925 queue" | Add-Content $log
while ($true) {
  $finished = @(Get-Content $done)
  $next = Get-Content "$dir\queue.txt" | Where-Object { $_.Trim() -and -not $_.StartsWith('#') } | Where-Object { $finished -notcontains ($_.Split('|')[0] + '-' + $_.Split('|')[1]) } | Select-Object -First 1
  if (-not $next) { break }
  $f = $next.Split('|')
  $name = "$($f[0])-$($f[1])"
  $t0 = Get-Date
  "$(Get-Date -Format s) started $name bands $($f[2]) gap $($f[3])" | Add-Content $log
  $p = Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"$priv\jobF.ps1",'-who',$f[0],'-preset',$f[1],'-bands',"`"$($f[2])`"",'-mingap',$f[3],'-workers','16') -PassThru -WindowStyle Hidden
  while (-not $p.HasExited) { Start-Sleep -Seconds 20; Pin-Cores }
  $name | Add-Content $done
  $os = Get-CimInstance Win32_OperatingSystem
  "$(Get-Date -Format s) finished $name in $([math]::Round(((Get-Date) - $t0).TotalMinutes,1)) min (free $([math]::Round($os.FreePhysicalMemory/1MB,1)) GB)" | Add-Content $log
}
"$(Get-Date -Format s) QUEUE EMPTY" | Add-Content $log
