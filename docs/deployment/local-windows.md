# Local Windows deployment

SPARK runs in Docker while OneDrive remains managed by the Windows OneDrive client. Test the setup with non-production files before introducing operational records.

## Prepare storage

1. Sign in to the dedicated Windows system account in OneDrive.
2. Create the shared files folder outside SPARK's private data folder.
3. In File Explorer, choose **Always keep on this device** for the shared files folder.
4. Wait for the folder and its contents to show the completed green status.
5. Create a separate private directory for the SQLite database, versions, recycle bin, and caches. Never put this directory inside the shared files folder.
6. In Docker Desktop, ensure both host paths are available for bind mounts.

## Configure

Create `.env` beside `compose.yaml`:

```dotenv
SPARK_ORIGIN=http://localhost:3000
SPARK_PORT=3000
SPARK_DATA_DIR_HOST=C:\spark\data
SPARK_FILES_ROOT_HOST=C:\Users\YourUser\OneDrive - DOE\Shared Files
SPARK_SESSION_SECRET=replace-with-at-least-32-random-characters
SPARK_TRUST_PROXY=false
```

Generate a secret with PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

## Start and bootstrap

```powershell
docker compose config
docker compose up -d --build
docker compose exec spark npm run admin:create -- --username admin --display-name "SPARK Administrator"
Invoke-RestMethod http://localhost:3000/api/health/ready
```

The administrator command prompts twice without accepting the password in command arguments or environment variables. A healthy response reports only `database`, `dataDirectory`, and `filesRoot` booleans; host paths remain server-side.

OneDrive synchronization is external to SPARK. Confirm the Windows client is running and fully synchronized before maintenance or recovery work.
