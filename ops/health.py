#!/usr/bin/env python3
import pathlib,subprocess,json,datetime,shutil
base=pathlib.Path('/workspace/gestion-courrier')
def run(args):
    try:return subprocess.run(args,capture_output=True,text=True,timeout=12).returncode==0
    except Exception:return False
backups=sorted((base/'backups/daily').glob('20*T*Z')) if (base/'backups/daily').exists() else []
last=backups[-1] if backups else None
storage=shutil.disk_usage(base)
services={name:run(['supervisorctl','status',name]) for name in ['courrier-db','courrier-php','courrier-web','courrier-worker','courrier-tunnel']}
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'apiHealthy':run(['curl','--max-time','10','-fsS','http://127.0.0.1:18080/backend/api/health']),'databaseHealthy':run(['mariadb-admin','ping','--silent']),'services':services,'diskFreeBytes':storage.free,'diskTotalBytes':storage.total,'latestBackup':last.name if last else None,'backupVerified':False}
# sha256 paths are relative to the backup directory.
if last:
    try:result['backupVerified']=subprocess.run(['sha256sum','--check','--status','SHA256SUMS'],cwd=last,timeout=60).returncode==0
    except Exception:result['backupVerified']=False
path=base/'operations-health.json';temp=path.with_suffix('.tmp');temp.write_text(json.dumps(result));temp.chmod(0o644);temp.replace(path)
