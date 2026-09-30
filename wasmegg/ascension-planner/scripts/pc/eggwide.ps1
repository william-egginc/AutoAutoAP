# Egg Day, wider (2026-09-29, the user asked whether other ascension counts or checkpoints beat the
# 139 166 198 222 route). Fastest plan to one target (default 247, whose best so far is 289.994 d)
# with one to six stops before it, over wide checkpoint ranges. Built on eggday.ps1 / horizon.ps1.
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
  [string]$prefix = 'G',
  [int]$target = 247,
  [string]$targets = '241 244 247 250 253 256',
  [string]$by = '2027-07-14 23:59',
  [switch]$test
)
$ErrorActionPreference = 'Continue'
(Get-Process -Id $PID).PriorityClass = 'BelowNormal'
$priv = 'C:\Users\cha12\aaap-private'
$base = "$priv\refine0928"
New-Item -ItemType Directory -Force $base | Out-Null
$log = "$base\eggwide.log"
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



Log "START $who Egg Day wide: fastest to $target with 1-6 stops before it, hours $from-$to"
$runs = @(
  @('s1', '138-140:1', @(3)),
  @('s2', '138-140:1; 170-230:2', @(3, 31)),
  @('s3', '138-140:1; 150-190:2; 190-230:2', @(3, 21, 21)),
  @('s5', '138-140:1; 150-166:4; 168-190:4; 194-210:4; 215-235:4', @(3, 5, 6, 5, 6)),
  @('s6', '139; 148-160:4; 164-180:4; 184-200:4; 204-220:4; 222-238:4', @(1, 4, 5, 5, 5, 5)),
  @('s4', '138-140:1; 152-180:2; 182-212:2; 210-240:2', @(3, 15, 16, 16))
)
$all = foreach ($r in $runs) { Run "w$($target)$($r[0])" $target $r[1] (Est $r[2]) }
$w = Best $all
if ($w) { Log "WIDE winner $($w.chain -join ' ') $target = $($w.days) d" }
Log 'END'
