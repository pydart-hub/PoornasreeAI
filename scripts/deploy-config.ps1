# Shared deploy targets for poornasree-v4 (ai.poornasreecloud.com).
# Dot-source from deploy scripts: . "$PSScriptRoot/deploy-config.ps1"

$script:DeployServer       = "poornasree-v4"   # SSH Alias
$script:DeployUser         = "abhishek"
$script:DeploySshPort     = 22
$script:DeployRemoteDir   = "/root/poornasree-ai"
$script:DeployKeyFile      = "$env:USERPROFILE\.ssh\poornasree-staff"
$script:DeployApiHealthPort = 4002             # v4: 4002 api, 3002 web (see docker-compose.v4.override.yml)
$script:DeployAppUrl       = "https://ai.poornasreecloud.com"
