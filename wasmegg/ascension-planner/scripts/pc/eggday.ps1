# "How high by Egg Day?" (2026-09-29, the user asked what the alt can reach by 14 Jul 2027 with their
# hours). Built on horizon.ps1: for each target T, the fastest plan to T (three or four stops before
# it, around the 225 winner 139 166 198); the answer is the highest T that finishes by the date.
# Every job keeps the current ascension going until the first checkpoint (-pindays), plans around
# the player's hours (-from/-to), and stops at a nearer final target than 490, so the next
# ascensions can be searched at every TE. Jobs run one at a time through jobR.ps1 into refine0928;
# nothing is posted (these are not plans to 490). No player ID in this file.
#   A. to 225: three checkpoints before it at every TE, plus two and four checkpoints before it;
#   B. to 260: around A's winner (+-1 on the first, +-2 on the next two), with the next checkpoint
#      at every TE from 218 to 232 and one more at every TE from 238 to 254, or without that one.
param(
  [string]$who = 'alt',
  [string]$pindays = '183',
  [int]$from = 9,
  [int]$to = 1,
  [int]$mingap = 8,
  [double]$hours = 10,
  [string]$prefix = 'E',
  [string]$targets = '241 244 247 250 253 256',
  [string]$by = '2027-07-14 23:59',
  [string]$startAt = '2026-09-24 08:43',
  [string]$bands4 = '138-140:1; 160-168:2; 196-200:2; 218-232:2',
  [string]$bands3 = '138-140:1; 160-168:2; 196-204:2',
  [switch]$test
)
$ErrorActionPreference = 'Continue'
(Get-Process -Id $PID).PriorityClass = 'BelowNormal'
$priv = 'C:\Users\cha12\aaap-private'
$base = "$priv\refine0928"
New-Item -ItemType Directory -Force $base | Out-Null
$log = "$base\eggday.log"
$deadline = (Get-Date).AddHours($hours)
$env:E2E_PIN_DAYS = $pindays
# -from and -to equal = available any time (as every run before 2026-09-28).
if ($from -ne $to) { $env:E2E_AVAIL_FROM = "$from"; $env:E2E_AVAIL_TO = "$to" }
else { Remove-Item Env:E2E_AVAIL_FROM, Env:E2E_AVAIL_TO -ErrorAction SilentlyContinue }
function Log([string]$s) { "$(Get-Date -Format s) $s" | Add-Content $log }
function Pin-Cores { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*aaap-*' } | ForEach-Object { try { $p = Get-Process -Id $_.ProcessId; if ($p.ProcessorAffinity -ne 0xFFFF) { $p.ProcessorAffinity = 0xFFFF; $p.PriorityClass = 'BelowNormal' } } catch {} } }
$script:n = 0

# One job to $final. Returns @{chain; days} for its best plan, or $null.
function Run([string]$tag, [int]$final, [string]$bands, [double]$estMin) {
  $left = ($deadline - (Get-Date)).TotalMinutes
  if ($estMin -gt $left) { Log "skip $tag (needs ~$([math]::Round($estMin)) min, $([math]::Round($left)) left)"; return $null }
  $script:n++
  $name = "$prefix$('{0:D2}' -f $script:n)$tag"
  $env:E2E_FINAL = "$final"
  Log "start $name to $final (~$([math]::Round($estMin)) min) bands $bands"
  $t0 = Get-Date
  $p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "$priv\jobR.ps1", '-base', $base, '-who', $who, '-preset', $name, '-bands', "`"$bands`"", '-mingap', $mingap, '-workers', '16') -PassThru -WindowStyle Hidden
  while (-not $p.HasExited) { Start-Sleep -Seconds 20; Pin-Cores }
  $dir = "$base\$who-$name"
  $mins = [math]::Round(((Get-Date) - $t0).TotalMinutes, 1)
  $m = Select-String -Path "$dir\log.txt" -Pattern '^best ([\d ]+?) (\d+) = ([0-9.]+) d' -ErrorAction SilentlyContinue | Select-Object -Last 1
  if (-not $m) { Log "done $name in $mins min: NO RESULT (see $dir\vitest.log)"; return $null }
  $chain = @($m.Matches[0].Groups[1].Value.Trim() -split ' ' | ForEach-Object { [int]$_ })
  $days = [double]$m.Matches[0].Groups[3].Value
  Log "done $name in $mins min: best $($chain -join ' ') $final = $days d"
  return @{ chain = $chain; days = $days }
}

# Minutes for a box of these band sizes (see refine.ps1), with the last leg as short as the rest.
function Est([int[]]$sizes) {
  $legs = 0; $prod = 1
  foreach ($s in $sizes) { $prod *= $s; $legs += $prod }
  return ($legs + $prod) * 5 * 1.2 / 16 / 60 + 2
}

function Best($results) { $results | Where-Object { $_ } | Sort-Object { $_.days } | Select-Object -First 1 }


$start = [datetime]$startAt   # the save's own time = the plan start (America/Denver)
$deadlineDate = [datetime]$by
$allowed = ($deadlineDate - $start).TotalDays
Log "START $who Egg Day: highest target reached by $by ($([math]::Round($allowed, 2)) d after the plan start), hours $from-$to, targets $targets"
foreach ($T in ($targets -split '\s+' | ForEach-Object { [int]$_ })) {
  $r4 = Run "t$($T)s4" $T $bands4 (Est @(5, 8, 6, 10))
  $r3 = if ($bands3) { Run "t$($T)s3" $T $bands3 (Est @(5, 8, 6)) } else { $null }
  $w = Best @($r4, $r3)
  if ($w) {
    $finish = $start.AddDays($w.days)
    Log "TARGET $T best $($w.chain -join ' ') $T = $($w.days) d, reached $($finish.ToString('yyyy-MM-dd HH:mm'))$(if ($w.days -le $allowed) { '  BY EGG DAY' } else { '  after Egg Day' })"
  }
}
Log 'END'
