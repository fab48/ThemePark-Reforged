# Theme Park, la distribution : refaire les compagnons d'apres les dossiers (Windows PowerShell 5.1,
# rien a installer). Lance par refaire.cmd.
#
# Ouverte d'un double-clic (file://), la page ne peut pas lire les fichiers voisins (images, sons...) :
# elle lit a la place, pour chaque dossier, un script compagnon qui porte les memes fichiers en base 64
# (images\images.js, sons\sons.js, donnees\donnees.js, animations\animations.js). Apres avoir modifie
# un fichier d'un de ces dossiers, il faut refaire les compagnons pour que le double-clic le voie ;
# servie (Theme Park.cmd), la page lit les fichiers eux-memes et n'en a pas besoin.
# Refait aussi sons\index.json, le manifeste des sons remplaces (moteur/web/fichiers-des-sons.js) :
# un son pose a cote de son original, du meme nom, dans un autre format (sons\bruitages\SNDS0-2\CASH.ogg
# pres de CASH.wav, sons\musiques\FM\RIDE4.ogg pres de RIDE4.mp3) y est inscrit, et la page le joue a
# sa place, servie comme en double-clic : elle ne peut pas lister un dossier. Ce qui y etait ecrit a la
# main est garde tant que le fichier designe existe. (Un son remplace par un fichier de meme nom et de
# meme format n'a besoin de rien : la page lit les sons eux-memes.)
#
# Les regles sont celles de moteur/hote/distribution.js (le depot), que suit aussi la construction
# (moteur/node/compagnons.mjs) : les changer la-bas, c'est les changer ici.
#   - chaque fichier du dossier et de ses sous-dossiers, sauf les .js et les notes (LISEZMOI...,
#     README...) ; de sons\, seulement ce que le moteur lit lui-meme : les morceaux HMP, les timbres
#     (.BNK) et le manifeste (les WAV et les MP3, la page les joue directement, meme en double-clic) ;
#   - la cle : le chemin dans la distribution, separe par / (images/banques/MSPR-0.png) ;
#   - la valeur : le fichier en base 64 ; compresse par gzip d'abord (valeur prefixee de "gzip:"),
#     sauf ce qui l'est deja (PNG, MP3, MP4, OGG, OPUS, M4A, FLAC).
#
# Usage : powershell -ExecutionPolicy Bypass -File lanceur\refaire.ps1 [-Dossier d]
param(
  [string]$Dossier = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)
$ErrorActionPreference = 'Stop'
$Dossier = (Resolve-Path $Dossier).Path
if (-not (Test-Path -LiteralPath (Join-Path $Dossier 'theme-park.html'))) {
  Write-Host "$Dossier n'est pas la distribution de Theme Park (theme-park.html manque)."
  exit 1
}

$compagnons = @(
  @{ Dossier = 'images'; Script = 'images/images.js'; Garde = $null },
  @{ Dossier = 'sons'; Script = 'sons/sons.js'; Garde = '(\.(hmp|bnk)$|^sons/index\.json$)' },
  @{ Dossier = 'donnees'; Script = 'donnees/donnees.js'; Garde = $null },
  @{ Dossier = 'animations'; Script = 'animations/animations.js'; Garde = $null }
)
$horsCompagnon = '(\.js|(^|/)(LISEZMOI|README)[^/]*)$'
$dejaCompresse = '\.(png|mp3|mp4|ogg|opus|m4a|flac)$'
$formatsAudio = '\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|webm)$'
$utf8 = New-Object Text.UTF8Encoding($false)

# Les fichiers d'un dossier, recursivement, en chemins relatifs (separes par /), dans l'ordre des noms.
function FichiersDe([string]$relatif) {
  $d = Join-Path $Dossier ($relatif -replace '/', '\')
  if (-not (Test-Path -LiteralPath $d)) { return }
  $entrees = @(Get-ChildItem -LiteralPath $d -Force)
  if (-not $entrees.Count) { return }
  $noms = [string[]]($entrees | ForEach-Object { $_.Name })
  [Array]::Sort($noms, [StringComparer]::Ordinal)
  foreach ($nom in $noms) {
    $c = "$relatif/$nom"
    if (Test-Path -LiteralPath (Join-Path $d $nom) -PathType Container) { FichiersDe $c } else { $c }
  }
}

function EnGzip([byte[]]$octets) {
  $memoire = New-Object IO.MemoryStream
  $gz = New-Object IO.Compression.GZipStream($memoire, [IO.Compression.CompressionLevel]::Optimal)
  $gz.Write($octets, 0, $octets.Length)
  $gz.Close()
  return ,$memoire.ToArray()
}
function EnJs([string]$s) { return $s.Replace('\', '\\').Replace("'", "\'") }
function EnJson([string]$s) { return '"' + $s.Replace('\', '\\').Replace('"', '\"') + '"' }

# Le manifeste des sons remplaces : {"bruitages":{"BANQUE/NOM":"chemin"},"musiques":{"NOM":"chemin"}}, les
# chemins relatifs a sons\ (les memes regles que moteur/web/fichiers-des-sons.js, manifesteDesSons).
function Tige([string]$c) {
  $n = $c.Substring($c.LastIndexOf('/') + 1)
  $p = $n.LastIndexOf('.')
  if ($p -ge 0) { return $n.Substring(0, $p) } else { return $n }
}
$tous = [string[]]@(FichiersDe 'sons')
[Array]::Sort($tous, [StringComparer]::Ordinal)
$manifeste = @{ bruitages = New-Object Collections.Specialized.OrderedDictionary; musiques = New-Object Collections.Specialized.OrderedDictionary }
function Poser([string]$genre, [string]$cle, [string]$valeur) {
  if (-not $manifeste[$genre].Contains($cle)) { $manifeste[$genre].Add($cle, $valeur) }
}
foreach ($c in $tous) {
  if ($c -notmatch $formatsAudio) { continue }
  $m = [regex]::Match($c, '^sons/bruitages/([^/]+)/[^/]+$')
  if ($m.Success -and $c -notmatch '\.wav$') { Poser 'bruitages' ($m.Groups[1].Value + '/' + (Tige $c)) $c.Substring(5) }
  $m = [regex]::Match($c, '^sons/musiques/([^/]+)/[^/]+$')
  if ($m.Success -and $c -notmatch '\.mp3$') { Poser 'musiques' (Tige $c) $c.Substring(5) }
}
# (l'ancien dossier des sons de remplacement, encore lu)
foreach ($c in $tous) {
  if ($c -notmatch $formatsAudio) { continue }
  $m = [regex]::Match($c, '^sons/remplacements/(bruitages|musiques)/[^/]+$')
  if ($m.Success) { Poser $m.Groups[1].Value (Tige $c) $c.Substring(5) }
}
# (ce qui etait ecrit a la main, si le fichier existe encore)
$fichierDuManifeste = Join-Path $Dossier 'sons\index.json'
if (Test-Path -LiteralPath $fichierDuManifeste) {
  try {
    $ancien = [IO.File]::ReadAllText($fichierDuManifeste, $utf8) | ConvertFrom-Json
    foreach ($genre in 'bruitages', 'musiques') {
      if (-not $ancien.$genre) { continue }
      foreach ($p in $ancien.$genre.PSObject.Properties) {
        if ($p.Value -is [string] -and $tous -contains ('sons/' + $p.Value.TrimStart('/'))) { Poser $genre $p.Name $p.Value }
      }
    }
  } catch { Write-Host "sons\index.json illisible : refait d'apres les dossiers." }
}
$parties = @()
foreach ($genre in 'bruitages', 'musiques') {
  $lignes = @($manifeste[$genre].Keys | ForEach-Object { '  ' + (EnJson $_) + ': ' + (EnJson $manifeste[$genre][$_]) })
  if ($lignes.Count) { $parties += ' ' + (EnJson $genre) + ": {`n" + ($lignes -join ",`n") + "`n }" }
  else { $parties += ' ' + (EnJson $genre) + ': {}' }
}
New-Item -ItemType Directory -Force -Path (Join-Path $Dossier 'sons') | Out-Null
[IO.File]::WriteAllText($fichierDuManifeste, "{`n" + ($parties -join ",`n") + "`n}", $utf8)
$remplaces = $manifeste.bruitages.Count + $manifeste.musiques.Count
Write-Host "sons\index.json : $remplaces son(s) remplace(s) par un fichier d'un autre format"

foreach ($c in $compagnons) {
  $debut = Get-Date
  $sortie = Join-Path $Dossier ($c.Script -replace '/', '\')
  $temporaire = "$sortie.partiel"
  $ecrivain = New-Object IO.StreamWriter($temporaire, $false, $utf8)
  $ecrivain.NewLine = "`n"
  $n = 0
  try {
    $ecrivain.WriteLine("// $($c.Script) : les fichiers de $($c.Dossier)/, en base 64, pour la page ouverte d'un double-clic (file://),")
    $ecrivain.WriteLine("// qui ne peut pas les lire elle-meme. Fait d'apres le dossier : ne pas le modifier a la main, mais modifier")
    $ecrivain.WriteLine("// les fichiers du dossier, puis relancer refaire.cmd.")
    $ecrivain.WriteLine('(function (F) {')
    foreach ($chemin in (FichiersDe $c.Dossier)) {
      if ($chemin -eq $c.Script -or $chemin -match $horsCompagnon -or $chemin.EndsWith('.partiel')) { continue }
      if ($c.Garde -and $chemin -notmatch $c.Garde) { continue }
      $octets = [IO.File]::ReadAllBytes((Join-Path $Dossier ($chemin -replace '/', '\')))
      if ($chemin -match $dejaCompresse) { $valeur = [Convert]::ToBase64String($octets) }
      else { $valeur = 'gzip:' + [Convert]::ToBase64String((EnGzip $octets)) }
      $ecrivain.WriteLine("F['" + (EnJs $chemin) + "'] = '" + $valeur + "';")
      $n++
    }
    $ecrivain.WriteLine('}((window.ThemePark = window.ThemePark || {}).fichiers || (window.ThemePark.fichiers = {})));')
  } finally {
    $ecrivain.Close()
  }
  Move-Item -LiteralPath $temporaire -Destination $sortie -Force
  $mo = '{0:N2}' -f ((Get-Item -LiteralPath $sortie).Length / 1MB)
  $s = '{0:N1}' -f ((Get-Date) - $debut).TotalSeconds
  Write-Host "$($c.Script) : $n fichiers, $mo Mo ($s s)"
}
Write-Host 'Compagnons refaits : la page ouverte d''un double-clic lit maintenant les fichiers modifies (la recharger).'
