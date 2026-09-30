# Update the PC's planner copy after the queued Egg Day runs, then re-price three routes on the new build.
$log = 'C:\Users\cha12\aaap-private\refine0928\eggday.log'
$ulog = 'C:\Users\cha12\aaap-private\refine0928\update.log'
function U([string]$s) { "$(Get-Date -Format s) $s" | Add-Content $ulog }
while (-not ((Select-String -Path $log -Pattern 'TARGET 244' -Quiet) -and ((Get-Content $log -Tail 1) -match ' END$'))) { Start-Sleep -Seconds 30 }
Set-Location C:\Users\cha12\aaap-runs
Get-ChildItem wasmegg\ascension-planner\src\stores -Filter 'zz_e2e_*' | Remove-Item -Force
U "before: $(git log --oneline -1)"
$o = git pull --ff-only 2>&1 | Out-String; U "pull: $($o.Trim() -replace '\s+', ' ')"
U "after: $(git log --oneline -1)"
$o = & npx -y pnpm@11.11.0 install --frozen-lockfile 2>&1 | Select-Object -Last 5 | Out-String; U "install (pnpm 11.11.0): $($o.Trim() -replace '\s+', ' ')"
Set-Location wasmegg\ascension-planner
$o = & npx -y pnpm@11.11.0 run search:build 2>&1 | Select-Object -Last 4 | Out-String; U "search:build: $($o.Trim() -replace '\s+', ' ')"
U "dist-search/fastsearch.js $((Get-Item dist-search\fastsearch.js).LastWriteTime.ToString('s')) $((Get-Item dist-search\fastsearch.js).Length) bytes"
# Same routes on the new build (hours 9-1 unless noted), to compare with the old build and the site.
& C:\Users\cha12\aaap-private\eggday.ps1 -who 'alt-0929' -pindays '' -from 9 -to 1 -hours 1 -prefix 'N' -targets '235' -startAt '2026-09-29 10:32' -by '2027-07-14 10:00' -bands4 '149; 196' -bands3 '140; 192'
& C:\Users\cha12\aaap-private\eggday.ps1 -who 'alt-0929' -pindays '' -from 0 -to 0 -hours 1 -prefix 'NA' -targets '235' -startAt '2026-09-29 10:32' -by '2027-07-14 10:00' -bands4 '149; 196' -bands3 '140; 192'
U 'DONE'
