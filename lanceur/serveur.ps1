# Theme Park : un serveur HTTP minimal pour jouer sans rien installer (Windows PowerShell 5.1 suffit).
# Sert le dossier du jeu sur http://localhost:8123/, gere les lectures partielles (Range : les films,
# les gros fichiers) et ouvre le navigateur. Fermer cette fenetre arrete le serveur.
# Deux dossiers possibles : la distribution (theme-park.html a la racine : le moteur tourne dans le fil
# de la page, sans besoin d'isolation d'origine), ou le depot lui-meme (la page dans moteur/web/, le
# moteur dans un Worker qui partage sa memoire avec la page : il faut les en-tetes d'isolation
# d'origine, COOP et COEP, poses ici pour les deux, sans gene pour la distribution). Chaque fichier est
# servi sans cache : un asset modifie dans la distribution est pris au rechargement de la page.
#
# Usage : powershell -ExecutionPolicy Bypass -File lanceur\serveur.ps1 [-Dossier d] [-Port 8123] [-SansNavigateur]
param(
  [string]$Dossier = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
  [int]$Port = 8123,
  [switch]$SansNavigateur
)

$Dossier = (Resolve-Path $Dossier).Path
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css'; '.json' = 'application/json'; '.png' = 'image/png'; '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'
  '.ogg' = 'audio/ogg'; '.oga' = 'audio/ogg'; '.opus' = 'audio/ogg'; '.flac' = 'audio/flac'; '.m4a' = 'audio/mp4'
  '.aac' = 'audio/aac'; '.webm' = 'audio/webm'
  '.mp4' = 'video/mp4'; '.mid' = 'audio/midi'; '.txt' = 'text/plain; charset=utf-8'; '.ico' = 'image/x-icon' }
# La distribution (theme-park.html a la racine) ou le depot lui-meme (la page dans moteur/web/)
$site = Test-Path (Join-Path $Dossier 'theme-park.html')
$page = if ($site) { '/theme-park.html' } else { '/moteur/web/index.html' }

$serveur = New-Object System.Net.HttpListener
$serveur.Prefixes.Add("http://localhost:$Port/")
try { $serveur.Start() } catch {
  Write-Host "Le port $Port est deja pris (le jeu tourne peut-etre deja) : ouverture de la page seulement."
  if (-not $SansNavigateur) { Start-Process "http://localhost:$Port$page" }
  exit
}
Write-Host "Theme Park : http://localhost:$Port$page  (fermer cette fenetre arrete le jeu)"
if (-not $SansNavigateur) { Start-Process "http://localhost:$Port$page" }

while ($serveur.IsListening) {
  $ctx = $serveur.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $res.Headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    $res.Headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    $res.Headers['Cache-Control'] = 'no-store'
    $chemin = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($chemin -eq '/') { $chemin = $page }
    # Lance depuis le depot plutot que depuis la distribution : les animations intercalees sont dans
    # assets/.
    if (-not $site) {
      if ($chemin -eq '/animations/rendu.json') { $chemin = '/assets/animations/import/rendu.json' }
    }
    $fichier = Join-Path $Dossier ($chemin -replace '/', '\')
    $complet = [IO.Path]::GetFullPath($fichier)
    if (-not $complet.StartsWith($Dossier, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $complet -PathType Leaf)) {
      $res.StatusCode = 404; $res.Close(); continue
    }
    $ext = [IO.Path]::GetExtension($complet).ToLower()
    $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $res.Headers['Accept-Ranges'] = 'bytes'
    $taille = (Get-Item -LiteralPath $complet).Length
    $debut = 0; $fin = $taille - 1
    $plage = $req.Headers['Range']
    if ($plage -and $plage -match '^bytes=(\d*)-(\d*)$') {
      if ($Matches[1]) { $debut = [int64]$Matches[1] }
      if ($Matches[2]) { $fin = [Math]::Min([int64]$Matches[2], $taille - 1) }
      if ($debut -ge $taille -or $fin -lt $debut) { $res.StatusCode = 416; $res.Headers['Content-Range'] = "bytes */$taille"; $res.Close(); continue }
      $res.StatusCode = 206
      $res.Headers['Content-Range'] = "bytes $debut-$fin/$taille"
    }
    $res.ContentLength64 = $fin - $debut + 1
    if ($req.HttpMethod -ne 'HEAD') {
      $flux = [IO.File]::Open($complet, 'Open', 'Read', 'Read')
      try {
        $flux.Position = $debut
        $tampon = New-Object byte[] 65536
        $reste = $fin - $debut + 1
        while ($reste -gt 0) {
          $n = $flux.Read($tampon, 0, [Math]::Min($tampon.Length, $reste))
          if ($n -le 0) { break }
          $res.OutputStream.Write($tampon, 0, $n)
          $reste -= $n
        }
      } finally { $flux.Close() }
    }
    $res.Close()
  } catch {
    try { $res.Abort() } catch {}
  }
}
