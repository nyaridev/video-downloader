# Video Downloader

A simple YouTube downloader for Windows with a local GUI. Download videos, playlists, or channels as `.mp4`, `.m4a`, thumbnails, and compact metadata.

## Requirements

- Windows 10/11
- [Python 3.10+](https://www.python.org/downloads/)
- [ffmpeg](https://ffmpeg.org/download.html) in your PATH (for merging video/audio)
- Optional: [uv](https://docs.astral.sh/uv/) for faster installs (otherwise uses built-in `venv` + `pip`)

## Run

1. Double-click **`start.bat`**
2. First run creates `.venv` and installs dependencies
3. Use the window to paste a URL and download

Optional: edit **`start-user.bat`** to set a custom Python path, then run that instead.

Downloads go to the **`output/`** folder by default.

## YouTube sign-in

If downloads fail with a bot check:

1. Enable **Use browser cookies** in the app
2. Click **Sign in to YouTube**
3. Sign in in the browser that opens, then try again

For Chrome/Edge, the app launches the browser with a cookie unlock flag. Firefox or a `cookies.txt` file also works.

## Project layout

```
start.bat          Launch the app
start-user.bat     Optional Python override
main.py            Entry point
app/               Code and GUI
output/            Default downloads (created automatically)
```
