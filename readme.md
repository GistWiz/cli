###### production
```
cp .env.example .env
vim .env

brew install fswatch
chmod +x src/bin/redis-file-monitor.sh
bun monitor

bun gistwiz gists --token <token>
bun gistwiz serve --port 3721
```

###### provisioning
```
bun pro
bun pro ssh
```