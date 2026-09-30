# Posts every fine0925 run to the board once its payload + table are written (user asked for these PC
# runs to be run and posted under their names, 2026-09-25). post_pair.mjs names main-* Williamthe5thc
# and alt-* Willsalt, strips the run cost, and refuses a payload that mentions a player id.
$priv = 'C:\Users\cha12\aaap-private'
$dir = "$priv\fine0925"
$log = "$dir\posted.log"
$until = (Get-Date).AddHours(96)
"$(Get-Date -Format s) watcher started" | Add-Content $log
while ((Get-Date) -lt $until) {
  $posted = @(Get-Content $log -ErrorAction SilentlyContinue | ForEach-Object { if ($_ -match '^\S+ (\S+) (id|ended|REFUSED|SKIPPED)') { $Matches[1] } })
  foreach ($d in Get-ChildItem $dir -Directory) {
    $r = $d.Name
    if ($posted -contains $r) { continue }
    $csv = "$dir\$r\table.csv"
    if ((Test-Path "$dir\$r\payload.json") -and (Test-Path $csv) -and ((Get-Date) - (Get-Item $csv).LastWriteTime).TotalSeconds -gt 60) {
      Push-Location $dir
      $out = & 'C:\Program Files\nodejs\node.exe' "$priv\post_pair.mjs" $r 2>&1
      Pop-Location
      "$(Get-Date -Format s) $out" | Add-Content $log
    } elseif ((Test-Path "$dir\$r\log.txt") -and (Select-String -Path "$dir\$r\log.txt" -Pattern '^EXIT [1-9]' -Quiet)) {
      "$(Get-Date -Format s) $r ended without a result; see $dir\$r\vitest.log" | Add-Content $log
    }
  }
  Start-Sleep -Seconds 120
}
"$(Get-Date -Format s) watcher done" | Add-Content $log
