# ============================================================
# import-dealers.ps1 — Bulk import 67 dealers from Excel data
# ============================================================
param(
    [string]$Server    = "187.77.188.63",
    [string]$User      = "deploy",
    [int]   $SshPort   = 2222,
    [string]$RemoteDir = "/home/deploy/poornasree-ai"
)
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " PoornasreeAI - Import Dealers from Excel"  -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Node.js script — runs inside API container (has Prisma + bcrypt already)
$nodeScript = @'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();
const SALT = 12;
const PWD = 'Dealer@2026';
const DEALERS = [
  {n:'SSS TECHNOLOGIES',s:'Tamil Nadu',p:'638004',c:'Erode'},
  {n:'SHREEM DAIRY EQUIPMENTS',s:'Tamil Nadu',p:'641004',c:'Coimbatore'},
  {n:'EKO TECH',s:'Tamil Nadu',p:'605602',c:'Villupuram'},
  {n:'SOFTROSYS',s:'Karnataka',p:'560058',c:'Bangalore'},
  {n:'BENAKA TECHNOLOGIES',s:'Karnataka',p:'560021',c:'Bangalore'},
  {n:'NEW ROLLI TRADERS',s:'Karnataka',p:'587313',c:'Bagalkote'},
  {n:'DIAMOND SCALES',s:'Karnataka',p:'591306',c:'Belgavi'},
  {n:'SRINIVAS MUMMIDI',s:'Andhra Pradesh',p:'533003',c:'East Godavari'},
  {n:'BHAVANI SHANKAR',s:'Andhra Pradesh',p:'521105',c:'Krishna Dist'},
  {n:'SRI RAM DAIRY TECHNOLOGIES',s:'Andhra Pradesh',p:'515671',c:'Anantapur'},
  {n:'EECO TECH',s:'Andhra Pradesh',p:'530007',c:'Visakhapatnam'},
  {n:'ARM TECHNOLOGIES',s:'Telangana',p:'500009',c:'Secunderabad'},
  {n:'VOMLANHS CORPORATION',s:'Telangana',p:'500003',c:'Secunderabad'},
  {n:'BHAGAVATHI TOOLS',s:'Telangana',p:'500003',c:'Secunderabad'},
  {n:'MAULI KRIPA',s:'Maharashtra',p:'416234',c:'Kolhapur'},
  {n:'SHUBHAM COMPUTERS',s:'Maharashtra',p:'411019',c:'Pune'},
  {n:'AMOL SCIENTIFIC',s:'Maharashtra',p:'422009',c:'Nashik'},
  {n:'SWARAJYA INDUSTRIES',s:'Maharashtra',p:'440034',c:'Nagpur'},
  {n:'DM SALES',s:'Maharashtra',p:'413517',c:'Udgir'},
  {n:'KOROVO TECHNOLOGIES',s:'Maharashtra',p:'411037',c:'Pune'},
  {n:'VINAYAK ENTERPRISE',s:'Chhattisgarh',p:'491001',c:'Durg'},
  {n:'WEIGH SHOPPE',s:'Chhattisgarh',p:'492001',c:'Raipur'},
  {n:'DAIRY UDYOG',s:'Odisha',p:'751007',c:'Khurda'},
  {n:'FATOCARE INDIA',s:'Gujarat',p:'384315',c:'Mehsana'},
  {n:'NANDINI MACHINERY',s:'Madhya Pradesh',p:'452001',c:'Indore'},
  {n:'HRG EQUIPMENTS',s:'Madhya Pradesh',p:'462038',c:'Bhopal'},
  {n:'K D TRADING COMPANY',s:'Madhya Pradesh',p:'482002',c:'Jabalpur'},
  {n:'RAKESH CREAM SEPERATOR',s:'Madhya Pradesh',p:'474005',c:'Gwalior'},
  {n:'SHREE RAM ENTERPRISES',s:'Madhya Pradesh',p:'465683',c:'Rajgarh'},
  {n:'RAMACHANDRA SRINIVAS',s:'Madhya Pradesh',p:'458883',c:'Mandsaur'},
  {n:'SHRI JINENDRA AGENCIES',s:'Madhya Pradesh',p:'452001',c:'Indore'},
  {n:'SHREE MAHALAKSHMI',s:'Rajasthan',p:'313001',c:'Udaipur'},
  {n:'SHARMA DAIRY',s:'Rajasthan',p:'313001',c:'Udaipur'},
  {n:'JAGDISH ENTERPRISES',s:'Rajasthan',p:'324007',c:'Kota'},
  {n:'SN INSTRUMENTS',s:'Rajasthan',p:'302033',c:'Jaipur'},
  {n:'PK DAIRY EQUIPMENTS',s:'Rajasthan',p:'313001',c:'Udaipur'},
  {n:'TAKSHRYA SALES',s:'Rajasthan',p:'313001',c:'Udaipur'},
  {n:'MURLIWALA TRADERS',s:'Delhi',p:'110042',c:'Shivpur'},
  {n:'JAY KRISHNA TRADERS',s:'Uttar Pradesh',p:'206122',c:'Auraiya'},
  {n:'PRAJJAWAL TRADERS',s:'Uttar Pradesh',p:'212207',c:'Kaushambi'},
  {n:'UTHM UDYOG',s:'Uttar Pradesh',p:'250002',c:'Meerut'},
  {n:'GANGA DAIRY',s:'Uttar Pradesh',p:'221002',c:'Varanasi'},
  {n:'SHUBANGI CHANDAN',s:'Bihar',p:'848101',c:'Samastipur'},
  {n:'MANISH ENTERPRISES',s:'Bihar',p:'800007',c:'Patna'},
  {n:'GIRI ENTERPRISES',s:'West Bengal',p:'721626',c:'Medinipur'},
  {n:'B T TRADERS',s:'West Bengal',p:'711109',c:'Howrah'},
  {n:'JM ENTERPRISES',s:'West Bengal',p:'700026',c:'Kolkata'},
  {n:'PARTHA GHOSH',s:'West Bengal',p:'741402',c:'Nadia'},
  {n:'GHOSH AGRO AND DAIRY',s:'West Bengal',p:'741502',c:'Nadia'},
  {n:'AGGARWAL TRADERS',s:'Punjab',p:'141001',c:'Ludhiana'},
  {n:'PAL DAIRY EQUIPMENTS',s:'Punjab',p:'144012',c:'Jalandhar'},
  {n:'SANDEEP DAIRY',s:'Punjab',p:'143001',c:'Amritsar'},
  {n:'INDER ELECTRONICS',s:'Punjab',p:'148002',c:'Sangrur'},
  {n:'MASTER DAIRY',s:'Jammu and Kashmir',p:'192301',c:'Pulwama'},
  {n:'S AND S TOOLS',s:'Jammu',p:'182204',c:'Doda'},
  {n:'RISHIK CHARAN',s:'Assam',p:'781021',c:'Kamrup Metro'},
  {n:'V N ENTERPRISES',s:'Assam',p:'781005',c:'Guwahati'},
  {n:'JK SCIENTIFIC',s:'Haryana',p:'133001',c:'Ambala Cantt'},
  {n:'LAB EX EXPORTS',s:'Haryana',p:'133001',c:'Ambala Cantt'},
  {n:'ANE DAIRY',s:'Arunachal Pradesh',p:'791112',c:'Papum Pare'},
  {n:'APS INDUSTRIES',s:'Jharkhand',p:'831002',c:'Jamshedpur'},
  {n:'REAL IONS',s:'Uttarakhand',p:'247661',c:'Haridwar'},
  {n:'LUKHOI PANEER',s:'Manipur',p:'795001',c:'Imphal'},
  {n:'DIGITAL WEIGHING',s:'Sri Lanka',p:'11350',c:'Ja Ela'},
  {n:'DAIRY CONSULTING LTD',s:'Kenya',p:'2162900100',c:'Nairobi'},
  {n:'BAL KUMARI AGRO',s:'Nepal',p:null,c:null},
  {n:'FOOD TECH',s:'Tanzania',p:null,c:null},
];
async function main() {
  let created = 0, skipped = 0, errors = 0;
  for (const d of DEALERS) {
    const email = d.n.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') + '@dealer.poornasree.com';
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) { process.stdout.write('  ~ ' + d.n + ' -- already exists, skipped\n'); skipped++; continue; }
      let pincodeId = null;
      if (d.p) {
        let pc = await prisma.pincode.findUnique({ where: { code: d.p } });
        if (!pc) pc = await prisma.pincode.create({ data: { code: d.p, place: d.c||null, state: d.s||null } });
        pincodeId = pc.id;
      }
      const hash = await bcrypt.hash(PWD, SALT);
      await prisma.user.create({ data: { email, passwordHash: hash, firstName: d.n, role: 'dealer', pincodeId } });
      process.stdout.write('  + ' + d.n + ' (' + email + ')\n');
      created++;
    } catch(e) { process.stdout.write('  ! ' + d.n + ' -- ' + e.message + '\n'); errors++; }
  }
  process.stdout.write('\nDone: ' + created + ' created, ' + skipped + ' skipped, ' + errors + ' errors\n');
  process.stdout.write('Default password for all dealers: ' + PWD + '\n');
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
'@

Write-Host "[1/1] Running import inside API container on VPS..." -ForegroundColor Yellow

$sshArgs = @(
    "-p", "$SshPort",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=30",
    "$User@$Server"
)

# Encode script to base64 to avoid shell quoting issues, then decode and pipe to node
$bytes   = [System.Text.Encoding]::UTF8.GetBytes($nodeScript)
$encoded = [Convert]::ToBase64String($bytes)

$cmd = "cd $RemoteDir && printf '%s' '$encoded' | base64 -d | docker compose exec -T api node -"
& ssh @sshArgs $cmd

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Import complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host " Password for all dealers: Dealer@2026" -ForegroundColor Cyan
Write-Host " Email format: <name>@dealer.poornasree.com" -ForegroundColor Cyan
Write-Host ""
