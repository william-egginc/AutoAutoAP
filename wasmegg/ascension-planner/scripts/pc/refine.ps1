# Adaptive refinement of one account's best plan (2026-09-28: the user gave the PC ~12 h to find a
# really refined alt path). Runs jobR.ps1 jobs one at a time on 16 workers, each one centred on the
# best plan found so far:
#   0. with -pindays, the first leg is always "keep the current ascension going" (the account has
#      not ascended since its save), and a scan compares ascending soon with keeping going;
#   1. a head box: when to ascend next, and the checkpoint after that;
#   2. neighbouring pairs of checkpoints, every TE 5 either side, until a round finds nothing better;
#   3. every combination one TE either side of every checkpoint;
#   4. pairs again (3 either side) and, if anything moved, the one-either-side box again;
#   5. two 9-ascension probes (one more checkpoint early), reported but never followed;
#   6. if the time is there, a wider box: 2 either side on the first three checkpoints.
# Stops before any job that would not finish by the deadline. Milestone jobs (1, 3, 5, 6) are copied
# into fine0925, where postwatch2.ps1 posts them; the pair jobs stay in refine0928. No player ID in
# this file: the save is the one jobR.ps1 already uses.
param(
  [string]$who = 'alt',
  [string]$start = '138 164 198 226 252 282 318',
  [int]$c1lo = 137,
  [int]$c1hi = 144,
  [int]$mingap = 8,
  [double]$hours = 12,
  [string]$prefix = 'R',
  [string]$pindays = '',
  [int]$final = 490,
  [int]$from = 0,
  [int]$to = 0,
  [switch]$quick,
  [switch]$test
)
# Inherited by jobR.ps1 -> the harness -> the CLI workers (--continue-pin-days): leg 1 is continue.
if ($pindays) { $env:E2E_PIN_DAYS = $pindays } else { Remove-Item Env:E2E_PIN_DAYS -ErrorAction SilentlyContinue }
# A nearer final target than 490, and the player's hours (-from = -to: any hour). Added 2026-09-29.
$env:E2E_FINAL = "$final"
if ($from -ne $to) { $env:E2E_AVAIL_FROM = "$from"; $env:E2E_AVAIL_TO = "$to" } else { Remove-Item Env:E2E_AVAIL_FROM, Env:E2E_AVAIL_TO -ErrorAction SilentlyContinue }
$ErrorActionPreference = 'Continue'
(Get-Process -Id $PID).PriorityClass = 'BelowNormal'
$priv = 'C:\Users\cha12\aaap-private'
$base = "$priv\refine0928"
New-Item -ItemType Directory -Force $base | Out-Null
$log = "$base\refine.log"
$deadline = (Get-Date).AddHours($hours)
function Log([string]$s) { "$(Get-Date -Format s) $s" | Add-Content $log }
function Pin-Cores { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*aaap-*' } | ForEach-Object { try { $p = Get-Process -Id $_.ProcessId; if ($p.ProcessorAffinity -ne 0xFFFF) { $p.ProcessorAffinity = 0xFFFF; $p.PriorityClass = 'BelowNormal' } } catch {} } }

$script:W = @($start -split '\s+' | ForEach-Object { [int]$_ })
$script:best = [double]::MaxValue
$script:n = 0

# One job. Follows its winner when it beats the best so far (unless -probe); returns $true if it did.
function Run([string]$tag, [string]$bands, [double]$estMin, [switch]$post, [switch]$probe) {
  $left = ($deadline - (Get-Date)).TotalMinutes
  if ($estMin -gt $left) { Log "skip $tag (needs ~$([math]::Round($estMin)) min, $([math]::Round($left)) left)"; return $false }
  $script:n++
  $name = "$prefix$('{0:D2}' -f $script:n)$tag"
  Log "start $name (~$([math]::Round($estMin)) min) bands $bands"
  $t0 = Get-Date
  $p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "$priv\jobR.ps1", '-base', $base, '-who', $who, '-preset', $name, '-bands', "`"$bands`"", '-mingap', $mingap, '-workers', '16') -PassThru -WindowStyle Hidden
  while (-not $p.HasExited) { Start-Sleep -Seconds 20; Pin-Cores }
  $dir = "$base\$who-$name"
  $mins = [math]::Round(((Get-Date) - $t0).TotalMinutes, 1)
  $m = Select-String -Path "$dir\log.txt" -Pattern '^best ([\d ]+?) (\d+) = ([0-9.]+) d' -ErrorAction SilentlyContinue | Select-Object -Last 1
  if (-not $m) { Log "done $name in $mins min: NO RESULT (see $dir\vitest.log)"; return $false }
  $chain = @($m.Matches[0].Groups[1].Value.Trim() -split ' ' | ForEach-Object { [int]$_ })
  $days = [double]$m.Matches[0].Groups[3].Value
  $better = $days -lt ($script:best - 0.0005)
  if ($probe) {
    Log "done $name in $mins min: best $($chain -join ' ') $final = $days d$(if ($better) { '  BEATS THE REFINED PATH (not followed)' })"
    $better = $false
  } else {
    Log "done $name in $mins min: best $($chain -join ' ') $final = $days d$(if ($better) { '  NEW BEST' })"
    if ($better) { $script:W = $chain; $script:best = $days }
  }
  if ($post -and $final -eq 490) { Copy-Item $dir "$priv\fine0925\$who-$name" -Recurse -Force; Log "  queued for posting as $who-$name" }
  return $better
}

function Clamp([int]$i, [int]$v) { if ($i -eq 0) { [math]::Min([math]::Max($v, $c1lo), $c1hi) } else { $v } }

# Bands around the current best: $radius[i] TE either side of checkpoint i, every TE (0 = held).
function Around([int[]]$radius) {
  $parts = for ($i = 0; $i -lt $script:W.Count; $i++) {
    $r = $radius[$i]
    if ($r -le 0) { "$($script:W[$i])" }
    else {
      $lo = Clamp $i ($script:W[$i] - $r); $hi = Clamp $i ($script:W[$i] + $r)
      if ($lo -eq $hi) { "$lo" } else { "$lo-$($hi):1" }
    }
  }
  $parts -join '; '
}

# Minutes for a box of these band sizes, from this PC's alt runs: every distinct leg before the
# last costs ~5 CPU-s and every last leg (to 490, over a year of game time) ~12, on 16 workers;
# chains that share a prefix share its legs. Plus two minutes of setup and checking.
function Est([int[]]$sizes) {
  $legs = 0; $prod = 1
  foreach ($s in $sizes) { $prod *= $s; $legs += $prod }
  return ($legs * 5 + $prod * 12) / 16 / 60 + 2
}

function PairRound([int]$r) {
  $improved = $false
  for ($i = 0; $i -lt $script:W.Count - 1; $i++) {
    $rad = @(0) * $script:W.Count; $rad[$i] = $r; $rad[$i + 1] = $r
    $sizes = @(1) * $script:W.Count; $sizes[$i] = 2 * $r + 1; $sizes[$i + 1] = 2 * $r + 1
    if (Run "p$($i + 1)$($i + 2)" (Around $rad) (Est $sizes)) { $improved = $true }
  }
  return $improved
}

Log "START $who refine from $($script:W -join ' ')  $final, first checkpoint $c1lo-$c1hi, gap $mingap, continue pin $(if ($pindays) { "$pindays d" } else { 'default' }), until $($deadline.ToString('s'))$(if ($test) { ' [TEST]' })"

if ($test) {
  [void](Run 'one' (Around (@(0) * $script:W.Count)) 5)
  $rad = @(0) * $script:W.Count; $rad[$script:W.Count - 1] = 1
  [void](Run 'three' (Around $rad) 5)
  Log "TEST END best $($script:W -join ' ') $final = $($script:best) d"
  exit
}

# 0. Should it ascend soon at all? Three shapes, all starting "keep going until the first checkpoint":
#    ascend soon (8 ascensions), ascend in a few weeks (8), keep going a month or more (7).
#    The winner of all three, whatever its length, is what everything after refines.
if ($pindays) {
  [void](Run 'soon' "137-146:1; 154-176:2; 196-200:2; 226; 252; 282; 318" (Est @(10, 12, 3, 1, 1, 1, 1)) -post)
  [void](Run 'weeks' "146-160:2; 168-188:4; 198-202:4; 226; 252; 282; 318" (Est @(8, 6, 2, 1, 1, 1, 1)) -post)
  [void](Run 'later' "150-176:2; 194-206:3; 226; 252; 282; 318" (Est @(14, 5, 1, 1, 1, 1)) -post)
  Log "SCAN winner $($script:W -join ' ') $final = $($script:best) d"
}

# 1. When to ascend next (every TE 4 either side), and the checkpoint after it (every 2nd TE).
$k = $script:W.Count
$tail = if ($k -gt 3) { '; ' + (($script:W[3..($k - 1)]) -join '; ') } else { '' }
$h0 = Clamp 0 ($script:W[0] - 4); $h1 = Clamp 0 ($script:W[0] + 4)
$head = "$h0-$($h1):1; $($script:W[1] - 10)-$($script:W[1] + 10):2; $($script:W[2] - 4)-$($script:W[2] + 4):2$tail"
[void](Run 'head' $head (Est (@(($h1 - $h0 + 1), 11, 5) + @(1) * ($k - 3))) -post)

# 2. Neighbouring pairs, every TE 5 either side, until a whole round finds nothing better.
for ($round = 1; $round -le 4; $round++) { if (-not (PairRound 5)) { break } }

# 3. Every combination one TE either side of every checkpoint.
$k = $script:W.Count
$one = @(1) * $k
[void](Run 'j1' (Around $one) (Est (@(3) * $k)) -post)

# 4. Pairs again, 3 either side; the one-either-side box again if anything moved.
$moved = $false
for ($round = 1; $round -le 2; $round++) { if (PairRound 3) { $moved = $true } else { break } }
if ($moved) { [void](Run 'j1b' (Around $one) (Est (@(3) * $k)) -post) }

if ($quick) { Log "END best $($script:W -join ' ') $final = $($script:best) d (quick: no probes, no wide box)"; exit }

# 5. One more ascension: an extra checkpoint between the 2nd and 3rd, or between the 3rd and 4th.
$k = $script:W.Count
if ($k -ge 4) {
  $W = $script:W
  $m12 = [int][math]::Round(($W[1] + $W[2]) / 2); $m23 = [int][math]::Round(($W[2] + $W[3]) / 2)
  $rest = ($W[3..($k - 1)] | ForEach-Object { "$($_ - 2)-$($_ + 2):2" }) -join '; '
  $pa = "$($W[0]); $($W[1] - 6)-$($W[1]):3; $($m12 - 6)-$($m12 + 6):4; $($W[2] - 2)-$($W[2] + 2):2; $rest"
  [void](Run "n$($k + 2)a" $pa (Est (@(1, 3, 4, 3) + @(3) * ($k - 3))) -post -probe)
  $rest2 = ($W[4..($k - 1)] | ForEach-Object { "$($_ - 2)-$($_ + 2):2" }) -join '; '
  $pb = "$($W[0]); $($W[1]); $($W[2] - 4)-$($W[2]):2; $($m23 - 6)-$($m23 + 6):4; $($W[3] - 2)-$($W[3] + 2):2; $rest2"
  [void](Run "n$($k + 2)b" $pb (Est (@(1, 1, 3, 4, 3) + @(3) * ($k - 4))) -post -probe)
}

# 6. Wider, if the time is there: 2 either side on the first three checkpoints (the next
#    decisions), 1 on the rest.
$k = $script:W.Count
$wide = @(1) * $k; for ($i = 0; $i -lt [math]::Min(3, $k); $i++) { $wide[$i] = 2 }
[void](Run 'j2' (Around $wide) (Est (@(5) * [math]::Min(3, $k) + @(3) * [math]::Max(0, $k - 3))) -post)

Log "END best $($script:W -join ' ') $final = $($script:best) d"
