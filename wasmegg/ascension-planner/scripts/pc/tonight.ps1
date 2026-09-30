# Egg Day, 29-30 Sep 2026 (the user asked: update the PC, run 5 and 6 ascensions, then prove the
# best 4/5/6-ascension routes with step 1, the every-TE pair refinement). Alt, today's save, hours
# 9:00-01:00 Denver, deadline 14 Jul 2027 9:00 AM Pacific. No player ID in this file.
$ErrorActionPreference = 'Continue'
$priv = 'C:\Users\cha12\aaap-private'
$tlog = "$priv\refine0928\tonight.log"
function T([string]$s) { "$(Get-Date -Format s) $s" | Add-Content $tlog }
$who = 'alt-0929'; $startAt = '2026-09-29 10:32'; $by = '2027-07-14 10:00'
$allowed = ([datetime]$by - [datetime]$startAt).TotalDays

# 1. Update the planner copy and rebuild the search program (pnpm 11, not the pnpm 8 on PATH).
Set-Location C:\Users\cha12\aaap-runs
Get-ChildItem wasmegg\ascension-planner\src\stores -Filter 'zz_e2e_*' | Remove-Item -Force
T "update from $(git log --oneline -1)"
git pull --ff-only 2>&1 | Out-Null
T "now $(git log --oneline -1)"
& npx -y pnpm@11.11.0 install --frozen-lockfile 2>&1 | Out-Null
Set-Location wasmegg\ascension-planner
& npx -y pnpm@11.11.0 run search:build 2>&1 | Out-Null
T "search program built $((Get-Item dist-search\fastsearch.js).LastWriteTime.ToString('s'))"
Set-Location $priv

# The highest target an eggday.ps1 call reached by the deadline, and its route (read from its log lines).
function Grid([string]$prefix, [string]$targets, [string]$bands) {
  $before = @(Get-Content "$priv\refine0928\eggday.log").Count
  & "$priv\eggday.ps1" -who $who -pindays '' -from 9 -to 1 -hours 6 -prefix $prefix -targets $targets -startAt $startAt -by $by -bands4 $bands -bands3 '' | Out-Null
  $lines = @(Get-Content "$priv\refine0928\eggday.log") | Select-Object -Skip $before
  $hit = $lines | Where-Object { $_ -match 'TARGET (\d+) best ([\d ]+?) (\d+) = ([0-9.]+) d.*BY EGG DAY' } | ForEach-Object {
    [pscustomobject]@{ T = [int]$Matches[1]; Route = $Matches[2]; Days = [double]$Matches[4] } } | Sort-Object T -Descending | Select-Object -First 1
  if ($hit) { T "$prefix grid: highest by Egg Day $($hit.T) via $($hit.Route) ($($hit.Days) d of $([math]::Round($allowed, 2)))" } else { T "$prefix grid: none of $targets by Egg Day" }
  return $hit
}

# Step 1 on one route: refine (pairs every TE, then every combination +-1) toward one TE higher than it
# reached; if that makes the deadline, keep going up. Proves the route's TE is the local maximum.
function Prove([string]$tag, [string]$route, [int]$reached) {
  $r = $route; $best = $reached
  for ($target = $reached + 1; $target -le $reached + 4; $target++) {
    & "$priv\refine.ps1" -who $who -start $r -c1lo 138 -c1hi 152 -final $target -from 9 -to 1 -hours 3 -prefix "$tag$target" -quick | Out-Null
    $e = Select-String -Path "$priv\refine0928\refine.log" -Pattern '^\S+ END best ([\d ]+?) (\d+) = ([0-9.]+) d' | Select-Object -Last 1
    if (-not $e) { T "${tag}: refinement to $target gave no result"; break }
    $chain = $e.Matches[0].Groups[1].Value; $days = [double]$e.Matches[0].Groups[3].Value
    if ($days -le $allowed) { T "${tag}: $target IS reachable via $chain $target ($days d, $([math]::Round($allowed - $days, 2)) d spare)"; $r = $chain; $best = $target }
    else { T "${tag}: $target is NOT reachable: the best refined route $chain $target takes $days d, $([math]::Round($days - $allowed, 2)) d too long"; break }
  }
  T "$tag PROVEN: highest by Egg Day $best"
}

T "START tonight: allowed $([math]::Round($allowed, 2)) d from $startAt to $by"
# 2. The two new grids. Five ascensions = four stops before the last; six = five stops.
$g5 = Grid 'Q5' '246 247 248' '138-142:1; 158-172:2; 194-204:2; 214-232:2'
$g6 = Grid 'Q6' '246 247 248' '138-142:1; 150-166:4; 168-190:4; 194-210:4; 215-235:4'
# 3. Step 1 on the best 4-, 5- and 6-ascension routes.
Prove 'S4' '140 166 198' 244
if ($g5) { Prove 'S5' $g5.Route $g5.T }
if ($g6) { Prove 'S6' $g6.Route $g6.T }
T 'END tonight'
