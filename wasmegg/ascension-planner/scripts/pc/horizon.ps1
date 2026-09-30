# Horizon runs for one account (2026-09-28, the user asked: plan the alt only to 225, then to 260).
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
  [string]$prefix = 'H',
  [switch]$test
)
$ErrorActionPreference = 'Continue'
(Get-Process -Id $PID).PriorityClass = 'BelowNormal'
$priv = 'C:\Users\cha12\aaap-private'
$base = "$priv\refine0928"
New-Item -ItemType Directory -Force $base | Out-Null
$log = "$base\horizon.log"
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

Log "START $who horizon runs, continue pin $pindays d, hours $from-$to, gap $mingap, until $($deadline.ToString('s'))$(if ($test) { ' [TEST]' })"

if ($test) {
  [void](Run 'test' 225 '141; 166; 198' 5)
  Log 'TEST END'
  exit
}

# A. To 225.
$a1 = Run 'a3cp' 225 '137-146:1; 150-185:1; 185-215:1' (Est @(10, 36, 31))
$a2 = Run 'a2cp' 225 '137-146:1; 160-205:1' (Est @(10, 46))
$a3 = Run 'a4cp' 225 '137-146:3; 150-170:4; 172-195:4; 190-212:4' (Est @(4, 6, 6, 6))
$wa = Best @($a1, $a2, $a3)
if (-not $wa) { Log 'END: no result to 225'; exit }
Log "TO 225 winner $($wa.chain -join ' ') 225 = $($wa.days) d"

# B. To 260, around A's winner (its checkpoints before 225, then 225 itself free).
$c = $wa.chain
$lead = for ($i = 0; $i -lt $c.Count; $i++) {
  if ($i -eq 0) { "$([math]::Max(137, $c[0] - 1))-$($c[0] + 1):1" } else { "$($c[$i] - 2)-$($c[$i] + 2):1" }
}
$lead = $lead -join '; '
$sizes = @(3) + @(5) * ($c.Count - 1)
$b2 = Run 'b4' 260 "$lead; 218-245:1" (Est ($sizes + @(28)))
$b1 = Run 'b5' 260 "$lead; 218-232:1; 238-254:1" (Est ($sizes + @(15, 17)))
$wb = Best @($b1, $b2)
if ($wb) { Log "TO 260 winner $($wb.chain -join ' ') 260 = $($wb.days) d" }
Log 'END'
