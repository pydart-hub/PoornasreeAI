# Shared deploy targets for poornasree-v4 (ai.poornasreecloud.com).
# Dot-source from deploy scripts: . "$PSScriptRoot/deploy-config.ps1"

$script:DeployServer       = "65.20.72.131"   # SSH HostName (alias: poornasree-v4)
$script:DeployUser         = "root"
$script:DeploySshPort     = 22
$script:DeployRemoteDir   = "/root/poornasree-ai"
$script:DeployKeyFile      = "$env:USERPROFILE\.ssh\poornasree-v4-new"
$script:DeployApiHealthPort = 4002             # v4: 4002 api, 3002 web (see docker-compose.v4.override.yml)
$script:DeployAppUrl       = "https://ai.poornasreecloud.com"
