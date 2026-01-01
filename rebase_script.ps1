$file = $args[0]
$content = Get-Content $file -Encoding UTF8
$newContent = $content | ForEach-Object {
    if ($_ -match '^pick 1ee64ab') {
        $_ -replace '^pick', 'edit'
    } else {
        $_
    }
}
$newContent | Set-Content $file -Encoding UTF8

