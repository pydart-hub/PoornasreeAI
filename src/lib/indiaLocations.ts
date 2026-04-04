// Static India locations dataset — State → District → Pincodes
// Covers all 28 states + 8 UTs with major districts and representative pincodes.
// Used in the Service Manager "Locations" tab for hierarchical zone selection.

export interface PincodeEntry {
  code: string;
  name: string; // post office / locality name
}

export interface DistrictEntry {
  name: string;
  pincodes: PincodeEntry[];
}

export interface StateEntry {
  name: string;
  districts: DistrictEntry[];
}

export const INDIA_LOCATIONS: StateEntry[] = [
  {
    name: "Andhra Pradesh",
    districts: [
      {
        name: "Visakhapatnam",
        pincodes: [
          { code: "530001", name: "Visakhapatnam HO" },
          { code: "530002", name: "Waltair" },
          { code: "530003", name: "Gajuwaka" },
          { code: "530017", name: "Steel Plant" },
          { code: "531001", name: "Bheemunipatnam" },
        ],
      },
      {
        name: "Vijayawada",
        pincodes: [
          { code: "520001", name: "Vijayawada HO" },
          { code: "520002", name: "Governorpet" },
          { code: "520010", name: "Kandrika" },
          { code: "521001", name: "Machilipatnam" },
        ],
      },
      {
        name: "Guntur",
        pincodes: [
          { code: "522001", name: "Guntur HO" },
          { code: "522002", name: "Arundelpet" },
          { code: "522006", name: "Brodipet" },
          { code: "522004", name: "Naaz Centre" },
        ],
      },
      {
        name: "Nellore",
        pincodes: [
          { code: "524001", name: "Nellore HO" },
          { code: "524002", name: "Nellore Town" },
          { code: "524004", name: "Nellore Collectorate" },
        ],
      },
      {
        name: "Tirupati",
        pincodes: [
          { code: "517501", name: "Tirupati HO" },
          { code: "517502", name: "Tirupati East" },
          { code: "517507", name: "Tirumala" },
        ],
      },
    ],
  },
  {
    name: "Arunachal Pradesh",
    districts: [
      {
        name: "Itanagar",
        pincodes: [
          { code: "791111", name: "Itanagar HO" },
          { code: "791113", name: "Naharlagun" },
        ],
      },
      {
        name: "Tawang",
        pincodes: [
          { code: "790104", name: "Tawang HO" },
        ],
      },
    ],
  },
  {
    name: "Assam",
    districts: [
      {
        name: "Guwahati",
        pincodes: [
          { code: "781001", name: "Guwahati HO" },
          { code: "781003", name: "Paltan Bazaar" },
          { code: "781006", name: "Dispur" },
          { code: "781007", name: "Basistha" },
          { code: "781009", name: "Guwahati University" },
        ],
      },
      {
        name: "Dibrugarh",
        pincodes: [
          { code: "786001", name: "Dibrugarh HO" },
          { code: "786002", name: "Dibrugarh Town" },
        ],
      },
      {
        name: "Silchar",
        pincodes: [
          { code: "788001", name: "Silchar HO" },
          { code: "788004", name: "Silchar Town" },
        ],
      },
    ],
  },
  {
    name: "Bihar",
    districts: [
      {
        name: "Patna",
        pincodes: [
          { code: "800001", name: "Patna HO" },
          { code: "800002", name: "Patna City" },
          { code: "800004", name: "Bankipur" },
          { code: "800020", name: "Patna Sachivalaya" },
          { code: "800023", name: "Rajendra Nagar" },
        ],
      },
      {
        name: "Muzaffarpur",
        pincodes: [
          { code: "842001", name: "Muzaffarpur HO" },
          { code: "842002", name: "Muzaffarpur Town" },
        ],
      },
      {
        name: "Gaya",
        pincodes: [
          { code: "823001", name: "Gaya HO" },
          { code: "823002", name: "Gaya Town" },
        ],
      },
      {
        name: "Bhagalpur",
        pincodes: [
          { code: "812001", name: "Bhagalpur HO" },
          { code: "812002", name: "Bhagalpur Town" },
        ],
      },
    ],
  },
  {
    name: "Chhattisgarh",
    districts: [
      {
        name: "Raipur",
        pincodes: [
          { code: "492001", name: "Raipur HO" },
          { code: "492004", name: "Shankar Nagar" },
          { code: "492007", name: "Civil Lines Raipur" },
          { code: "492009", name: "Telibandha" },
        ],
      },
      {
        name: "Bhilai",
        pincodes: [
          { code: "490001", name: "Bhilai HO" },
          { code: "490006", name: "Bhilai Nagar" },
        ],
      },
      {
        name: "Bilaspur",
        pincodes: [
          { code: "495001", name: "Bilaspur HO" },
          { code: "495004", name: "Bilaspur City" },
        ],
      },
    ],
  },
  {
    name: "Goa",
    districts: [
      {
        name: "North Goa",
        pincodes: [
          { code: "403001", name: "Panaji HO" },
          { code: "403101", name: "Mapusa" },
          { code: "403206", name: "Calangute" },
          { code: "403517", name: "Pernem" },
        ],
      },
      {
        name: "South Goa",
        pincodes: [
          { code: "403601", name: "Margao HO" },
          { code: "403702", name: "Vasco Da Gama" },
          { code: "403801", name: "Quepem" },
        ],
      },
    ],
  },
  {
    name: "Gujarat",
    districts: [
      {
        name: "Ahmedabad",
        pincodes: [
          { code: "380001", name: "Ahmedabad HO" },
          { code: "380006", name: "Navrangpura" },
          { code: "380009", name: "Ghatlodia" },
          { code: "380013", name: "Vastrapur" },
          { code: "382345", name: "Maninagar" },
          { code: "380058", name: "Satellite" },
        ],
      },
      {
        name: "Surat",
        pincodes: [
          { code: "395001", name: "Surat HO" },
          { code: "395002", name: "Surat Ramnath" },
          { code: "395004", name: "Adajan" },
          { code: "395007", name: "Vesu" },
        ],
      },
      {
        name: "Vadodara",
        pincodes: [
          { code: "390001", name: "Vadodara HO" },
          { code: "390005", name: "Alkapuri" },
          { code: "390007", name: "Vasna" },
        ],
      },
      {
        name: "Rajkot",
        pincodes: [
          { code: "360001", name: "Rajkot HO" },
          { code: "360002", name: "Rajkot City" },
          { code: "360005", name: "Karanpara" },
        ],
      },
      {
        name: "Gandhinagar",
        pincodes: [
          { code: "382010", name: "Gandhinagar HO" },
          { code: "382016", name: "Gandhinagar Sector 16" },
          { code: "382028", name: "Gandhinagar Sector 28" },
        ],
      },
    ],
  },
  {
    name: "Haryana",
    districts: [
      {
        name: "Gurugram",
        pincodes: [
          { code: "122001", name: "Gurgaon HO" },
          { code: "122002", name: "Sikanderpur" },
          { code: "122015", name: "DLF Phase 1" },
          { code: "122016", name: "DLF Phase 2" },
          { code: "122018", name: "Sector 14" },
        ],
      },
      {
        name: "Faridabad",
        pincodes: [
          { code: "121001", name: "Faridabad HO" },
          { code: "121002", name: "NIT Faridabad" },
          { code: "121006", name: "Sector 17 Faridabad" },
        ],
      },
      {
        name: "Ambala",
        pincodes: [
          { code: "134001", name: "Ambala City HO" },
          { code: "133001", name: "Ambala Cantonment" },
        ],
      },
      {
        name: "Hisar",
        pincodes: [
          { code: "125001", name: "Hisar HO" },
          { code: "125005", name: "Hisar City" },
        ],
      },
    ],
  },
  {
    name: "Himachal Pradesh",
    districts: [
      {
        name: "Shimla",
        pincodes: [
          { code: "171001", name: "Shimla HO" },
          { code: "171004", name: "Shimla Town" },
          { code: "171005", name: "Boileauganj" },
        ],
      },
      {
        name: "Dharamshala",
        pincodes: [
          { code: "176215", name: "Dharamshala HO" },
          { code: "176219", name: "McLeod Ganj" },
        ],
      },
      {
        name: "Manali",
        pincodes: [
          { code: "175131", name: "Manali HO" },
        ],
      },
    ],
  },
  {
    name: "Jharkhand",
    districts: [
      {
        name: "Ranchi",
        pincodes: [
          { code: "834001", name: "Ranchi HO" },
          { code: "834002", name: "Doranda" },
          { code: "834009", name: "Kanke" },
        ],
      },
      {
        name: "Dhanbad",
        pincodes: [
          { code: "826001", name: "Dhanbad HO" },
          { code: "826004", name: "Dhanbad Town" },
        ],
      },
      {
        name: "Jamshedpur",
        pincodes: [
          { code: "831001", name: "Jamshedpur HO" },
          { code: "831002", name: "Bistupur" },
        ],
      },
    ],
  },
  {
    name: "Karnataka",
    districts: [
      {
        name: "Bengaluru Urban",
        pincodes: [
          { code: "560001", name: "Bengaluru GPO" },
          { code: "560002", name: "Shivajinagar" },
          { code: "560011", name: "Jayanagar" },
          { code: "560025", name: "Indiranagar" },
          { code: "560034", name: "Whitefield" },
          { code: "560037", name: "HSR Layout" },
          { code: "560045", name: "Koramangala" },
          { code: "560068", name: "Electronic City" },
          { code: "560076", name: "Marathahalli" },
          { code: "560100", name: "Hebbal" },
        ],
      },
      {
        name: "Mysuru",
        pincodes: [
          { code: "570001", name: "Mysuru HO" },
          { code: "570004", name: "Saraswathipuram" },
          { code: "570009", name: "Vijayanagar" },
        ],
      },
      {
        name: "Hubballi",
        pincodes: [
          { code: "580001", name: "Hubballi HO" },
          { code: "580020", name: "Dharwad HO" },
          { code: "580029", name: "Vidyanagar Hubli" },
        ],
      },
      {
        name: "Mangaluru",
        pincodes: [
          { code: "575001", name: "Mangaluru HO" },
          { code: "575002", name: "Mangaluru Kankanady" },
          { code: "575006", name: "Mangaluru City" },
        ],
      },
      {
        name: "Belagavi",
        pincodes: [
          { code: "590001", name: "Belagavi HO" },
          { code: "590006", name: "Tilakwadi" },
        ],
      },
    ],
  },
  {
    name: "Kerala",
    districts: [
      {
        name: "Thiruvananthapuram",
        pincodes: [
          { code: "695001", name: "Thiruvananthapuram HO" },
          { code: "695003", name: "Pattom" },
          { code: "695011", name: "Kazhakkoottam" },
          { code: "695016", name: "Nalanchira" },
          { code: "695023", name: "Vattiyoorkavu" },
        ],
      },
      {
        name: "Ernakulam",
        pincodes: [
          { code: "682001", name: "Ernakulam North" },
          { code: "682016", name: "Kakkanad" },
          { code: "682017", name: "Kalamassery" },
          { code: "682019", name: "Infopark" },
          { code: "682030", name: "Thrippunithura" },
        ],
      },
      {
        name: "Kozhikode",
        pincodes: [
          { code: "673001", name: "Kozhikode HO" },
          { code: "673004", name: "Meenchanda" },
          { code: "673006", name: "Nadakkavu" },
        ],
      },
      {
        name: "Thrissur",
        pincodes: [
          { code: "680001", name: "Thrissur HO" },
          { code: "680020", name: "Thrissur East" },
        ],
      },
      {
        name: "Kollam",
        pincodes: [
          { code: "691001", name: "Kollam HO" },
          { code: "691004", name: "Chinnakada" },
        ],
      },
      {
        name: "Palakkad",
        pincodes: [
          { code: "678001", name: "Palakkad HO" },
          { code: "678002", name: "Palakkad Town" },
        ],
      },
      {
        name: "Alappuzha",
        pincodes: [
          { code: "688001", name: "Alappuzha HO" },
          { code: "688003", name: "Vadai" },
        ],
      },
    ],
  },
  {
    name: "Madhya Pradesh",
    districts: [
      {
        name: "Bhopal",
        pincodes: [
          { code: "462001", name: "Bhopal HO" },
          { code: "462003", name: "Bhopal City" },
          { code: "462011", name: "Berasia Road" },
          { code: "462016", name: "BHEL Bhopal" },
          { code: "462023", name: "Kolar Road" },
        ],
      },
      {
        name: "Indore",
        pincodes: [
          { code: "452001", name: "Indore HO" },
          { code: "452002", name: "Palasia" },
          { code: "452010", name: "Vijay Nagar" },
          { code: "452014", name: "Scheme 54" },
        ],
      },
      {
        name: "Jabalpur",
        pincodes: [
          { code: "482001", name: "Jabalpur HO" },
          { code: "482002", name: "Jabalpur City" },
          { code: "482003", name: "Gwarighat" },
        ],
      },
      {
        name: "Gwalior",
        pincodes: [
          { code: "474001", name: "Gwalior HO" },
          { code: "474002", name: "Lashkar" },
          { code: "474010", name: "Morar" },
        ],
      },
    ],
  },
  {
    name: "Maharashtra",
    districts: [
      {
        name: "Mumbai City",
        pincodes: [
          { code: "400001", name: "Fort" },
          { code: "400002", name: "Mandvi" },
          { code: "400005", name: "Colaba" },
          { code: "400008", name: "Kamathipura" },
          { code: "400012", name: "Parel" },
          { code: "400020", name: "Churchgate" },
          { code: "400051", name: "Bandra West" },
          { code: "400069", name: "Andheri West" },
          { code: "400076", name: "Powai" },
        ],
      },
      {
        name: "Mumbai Suburban",
        pincodes: [
          { code: "400053", name: "Bandra East" },
          { code: "400063", name: "Goregaon" },
          { code: "400067", name: "Malad" },
          { code: "400093", name: "Borivali" },
          { code: "400097", name: "Kandivali" },
        ],
      },
      {
        name: "Pune",
        pincodes: [
          { code: "411001", name: "Pune HO" },
          { code: "411004", name: "Shivajinagar Pune" },
          { code: "411007", name: "Deccan Gymkhana" },
          { code: "411014", name: "Kothrud" },
          { code: "411028", name: "Hinjewadi" },
          { code: "411045", name: "Koregaon Park" },
          { code: "411057", name: "Baner" },
        ],
      },
      {
        name: "Nagpur",
        pincodes: [
          { code: "440001", name: "Nagpur HO" },
          { code: "440009", name: "Dharampeth" },
          { code: "440010", name: "Byramji Town" },
          { code: "440013", name: "Manish Nagar" },
        ],
      },
      {
        name: "Nashik",
        pincodes: [
          { code: "422001", name: "Nashik HO" },
          { code: "422005", name: "Nashik Road" },
          { code: "422007", name: "College Road Nashik" },
        ],
      },
      {
        name: "Aurangabad",
        pincodes: [
          { code: "431001", name: "Aurangabad HO" },
          { code: "431003", name: "CIDCO Aurangabad" },
          { code: "431005", name: "Garkheda" },
        ],
      },
      {
        name: "Thane",
        pincodes: [
          { code: "400601", name: "Thane HO" },
          { code: "400604", name: "Thane Naupada" },
          { code: "400607", name: "Thane Kopri" },
        ],
      },
    ],
  },
  {
    name: "Manipur",
    districts: [
      {
        name: "Imphal West",
        pincodes: [
          { code: "795001", name: "Imphal HO" },
          { code: "795002", name: "Imphal East" },
        ],
      },
    ],
  },
  {
    name: "Meghalaya",
    districts: [
      {
        name: "East Khasi Hills",
        pincodes: [
          { code: "793001", name: "Shillong HO" },
          { code: "793003", name: "Shillong Bazaar" },
        ],
      },
    ],
  },
  {
    name: "Mizoram",
    districts: [
      {
        name: "Aizawl",
        pincodes: [
          { code: "796001", name: "Aizawl HO" },
          { code: "796005", name: "Aizawl Town" },
        ],
      },
    ],
  },
  {
    name: "Nagaland",
    districts: [
      {
        name: "Kohima",
        pincodes: [
          { code: "797001", name: "Kohima HO" },
          { code: "797002", name: "Kohima Town" },
        ],
      },
    ],
  },
  {
    name: "Odisha",
    districts: [
      {
        name: "Khordha",
        pincodes: [
          { code: "751001", name: "Bhubaneswar HO" },
          { code: "751003", name: "Saheed Nagar" },
          { code: "751007", name: "Chandrasekharpur" },
          { code: "751013", name: "Nayapalli" },
          { code: "751024", name: "Infocity Bhubaneswar" },
        ],
      },
      {
        name: "Cuttack",
        pincodes: [
          { code: "753001", name: "Cuttack HO" },
          { code: "753002", name: "Cuttack Cantonment" },
        ],
      },
      {
        name: "Rourkela",
        pincodes: [
          { code: "769001", name: "Rourkela HO" },
          { code: "769004", name: "Rourkela Steel Plant" },
        ],
      },
    ],
  },
  {
    name: "Punjab",
    districts: [
      {
        name: "Ludhiana",
        pincodes: [
          { code: "141001", name: "Ludhiana HO" },
          { code: "141002", name: "Ludhiana City" },
          { code: "141010", name: "Sarabha Nagar" },
          { code: "141012", name: "Model Town Ludhiana" },
        ],
      },
      {
        name: "Amritsar",
        pincodes: [
          { code: "143001", name: "Amritsar HO" },
          { code: "143002", name: "Amritsar City" },
          { code: "143006", name: "Ranjit Avenue" },
        ],
      },
      {
        name: "Jalandhar",
        pincodes: [
          { code: "144001", name: "Jalandhar HO" },
          { code: "144002", name: "Jalandhar City" },
          { code: "144008", name: "Model Town Jalandhar" },
        ],
      },
      {
        name: "Patiala",
        pincodes: [
          { code: "147001", name: "Patiala HO" },
          { code: "147002", name: "Patiala City" },
        ],
      },
    ],
  },
  {
    name: "Rajasthan",
    districts: [
      {
        name: "Jaipur",
        pincodes: [
          { code: "302001", name: "Jaipur HO" },
          { code: "302004", name: "C Scheme" },
          { code: "302006", name: "Mansarovar" },
          { code: "302015", name: "Malviya Nagar Jaipur" },
          { code: "302017", name: "Vaishali Nagar" },
          { code: "302020", name: "Nirman Nagar" },
        ],
      },
      {
        name: "Jodhpur",
        pincodes: [
          { code: "342001", name: "Jodhpur HO" },
          { code: "342003", name: "Ratanada" },
          { code: "342008", name: "Shastri Nagar Jodhpur" },
        ],
      },
      {
        name: "Udaipur",
        pincodes: [
          { code: "313001", name: "Udaipur HO" },
          { code: "313002", name: "Hiran Magri" },
        ],
      },
      {
        name: "Kota",
        pincodes: [
          { code: "324001", name: "Kota HO" },
          { code: "324005", name: "Kota Industrial" },
        ],
      },
    ],
  },
  {
    name: "Sikkim",
    districts: [
      {
        name: "East Sikkim",
        pincodes: [
          { code: "737101", name: "Gangtok HO" },
          { code: "737102", name: "Gangtok Bazaar" },
        ],
      },
    ],
  },
  {
    name: "Tamil Nadu",
    districts: [
      {
        name: "Chennai",
        pincodes: [
          { code: "600001", name: "Chennai GPO" },
          { code: "600002", name: "Anna Salai" },
          { code: "600006", name: "Mylapore" },
          { code: "600010", name: "Adyar" },
          { code: "600014", name: "Nungambakkam" },
          { code: "600017", name: "T Nagar" },
          { code: "600020", name: "Ashok Nagar Chennai" },
          { code: "600040", name: "Velachery" },
          { code: "600041", name: "Kodambakkam" },
          { code: "600042", name: "Vadapalani" },
          { code: "600096", name: "OMR Sholinganallur" },
          { code: "600097", name: "Thoraipakkam" },
        ],
      },
      {
        name: "Coimbatore",
        pincodes: [
          { code: "641001", name: "Coimbatore HO" },
          { code: "641004", name: "Peelamedu" },
          { code: "641013", name: "Race Course" },
          { code: "641018", name: "RS Puram" },
          { code: "641045", name: "Saravanampatti" },
        ],
      },
      {
        name: "Madurai",
        pincodes: [
          { code: "625001", name: "Madurai HO" },
          { code: "625002", name: "Madurai Town" },
          { code: "625009", name: "Anna Nagar Madurai" },
          { code: "625020", name: "SS Colony" },
        ],
      },
      {
        name: "Tiruchirappalli",
        pincodes: [
          { code: "620001", name: "Tiruchirappalli HO" },
          { code: "620002", name: "Cantonment Trichy" },
          { code: "620021", name: "K K Nagar Trichy" },
        ],
      },
      {
        name: "Salem",
        pincodes: [
          { code: "636001", name: "Salem HO" },
          { code: "636004", name: "Hasthampatti" },
          { code: "636007", name: "Fairlands" },
        ],
      },
      {
        name: "Tirunelveli",
        pincodes: [
          { code: "627001", name: "Tirunelveli HO" },
          { code: "627002", name: "Tirunelveli Town" },
          { code: "627011", name: "Palayamkottai" },
        ],
      },
      {
        name: "Erode",
        pincodes: [
          { code: "638001", name: "Erode HO" },
          { code: "638002", name: "Erode Town" },
        ],
      },
      {
        name: "Vellore",
        pincodes: [
          { code: "632001", name: "Vellore HO" },
          { code: "632004", name: "Katpadi" },
        ],
      },
      {
        name: "Kancheepuram",
        pincodes: [
          { code: "631501", name: "Kancheepuram HO" },
          { code: "631502", name: "Kancheepuram Town" },
        ],
      },
    ],
  },
  {
    name: "Telangana",
    districts: [
      {
        name: "Hyderabad",
        pincodes: [
          { code: "500001", name: "Hyderabad HO" },
          { code: "500003", name: "Begum Bazaar" },
          { code: "500016", name: "Banjara Hills" },
          { code: "500032", name: "Jubilee Hills" },
          { code: "500034", name: "Madhapur" },
          { code: "500072", name: "Gachibowli" },
          { code: "500081", name: "Kondapur" },
          { code: "500084", name: "HITEC City" },
          { code: "500089", name: "Nanakramguda" },
        ],
      },
      {
        name: "Cyberabad",
        pincodes: [
          { code: "500019", name: "Secunderabad HO" },
          { code: "500026", name: "Trimulgherry" },
          { code: "500055", name: "Kukatpally" },
          { code: "500072", name: "Raidurg" },
        ],
      },
      {
        name: "Warangal",
        pincodes: [
          { code: "506001", name: "Warangal HO" },
          { code: "506002", name: "Warangal Town" },
        ],
      },
      {
        name: "Nizamabad",
        pincodes: [
          { code: "503001", name: "Nizamabad HO" },
          { code: "503002", name: "Nizamabad Town" },
        ],
      },
    ],
  },
  {
    name: "Tripura",
    districts: [
      {
        name: "West Tripura",
        pincodes: [
          { code: "799001", name: "Agartala HO" },
          { code: "799003", name: "Agartala Town" },
        ],
      },
    ],
  },
  {
    name: "Uttar Pradesh",
    districts: [
      {
        name: "Lucknow",
        pincodes: [
          { code: "226001", name: "Lucknow HO" },
          { code: "226004", name: "Hazratganj" },
          { code: "226010", name: "Aliganj" },
          { code: "226016", name: "Gomti Nagar" },
          { code: "226020", name: "Vibhuti Khand" },
          { code: "226022", name: "Indira Nagar Lucknow" },
        ],
      },
      {
        name: "Kanpur",
        pincodes: [
          { code: "208001", name: "Kanpur HO" },
          { code: "208004", name: "Civil Lines Kanpur" },
          { code: "208012", name: "Kalyanpur" },
        ],
      },
      {
        name: "Agra",
        pincodes: [
          { code: "282001", name: "Agra HO" },
          { code: "282002", name: "Tajganj" },
          { code: "282005", name: "Dayalbagh" },
        ],
      },
      {
        name: "Varanasi",
        pincodes: [
          { code: "221001", name: "Varanasi HO" },
          { code: "221002", name: "Ordaly Bazar" },
          { code: "221005", name: "BHU" },
          { code: "221010", name: "Sarnath" },
        ],
      },
      {
        name: "Prayagraj",
        pincodes: [
          { code: "211001", name: "Prayagraj HO" },
          { code: "211002", name: "Civil Lines Prayagraj" },
          { code: "211004", name: "Teliarganj" },
        ],
      },
      {
        name: "Meerut",
        pincodes: [
          { code: "250001", name: "Meerut HO" },
          { code: "250002", name: "Meerut City" },
          { code: "250005", name: "Garh Road" },
        ],
      },
      {
        name: "Gautam Buddha Nagar",
        pincodes: [
          { code: "201301", name: "Noida Sector 1" },
          { code: "201305", name: "Noida Sector 44" },
          { code: "201306", name: "Noida Sector 58" },
          { code: "201310", name: "Greater Noida" },
          { code: "201318", name: "Noida Sector 18" },
        ],
      },
    ],
  },
  {
    name: "Uttarakhand",
    districts: [
      {
        name: "Dehradun",
        pincodes: [
          { code: "248001", name: "Dehradun HO" },
          { code: "248007", name: "Rajpur Road" },
          { code: "248009", name: "Vasant Vihar Dehradun" },
          { code: "248011", name: "Defence Colony Dehradun" },
        ],
      },
      {
        name: "Haridwar",
        pincodes: [
          { code: "249401", name: "Haridwar HO" },
          { code: "249407", name: "Roorkee" },
          { code: "247667", name: "Roorkee City" },
        ],
      },
      {
        name: "Nainital",
        pincodes: [
          { code: "263001", name: "Nainital HO" },
          { code: "243601", name: "Haldwani" },
        ],
      },
    ],
  },
  {
    name: "West Bengal",
    districts: [
      {
        name: "Kolkata",
        pincodes: [
          { code: "700001", name: "Kolkata GPO" },
          { code: "700013", name: "Entally" },
          { code: "700016", name: "Bhowanipore" },
          { code: "700019", name: "Ballygunge" },
          { code: "700029", name: "Dhakuria" },
          { code: "700032", name: "Jadavpur" },
          { code: "700054", name: "Salt Lake Sector 1" },
          { code: "700064", name: "Salt Lake Sector 5" },
          { code: "700091", name: "Rajarhat" },
          { code: "700107", name: "New Town Kolkata" },
        ],
      },
      {
        name: "Howrah",
        pincodes: [
          { code: "711101", name: "Howrah HO" },
          { code: "711102", name: "Howrah Maidan" },
          { code: "711103", name: "Shibpur" },
        ],
      },
      {
        name: "North 24 Parganas",
        pincodes: [
          { code: "743101", name: "Barasat HO" },
          { code: "743201", name: "Bongaon" },
          { code: "700135", name: "Madhyamgram" },
        ],
      },
      {
        name: "Darjeeling",
        pincodes: [
          { code: "734101", name: "Darjeeling HO" },
          { code: "734004", name: "Siliguri HO" },
          { code: "734001", name: "Siliguri Town" },
        ],
      },
    ],
  },
  // ── Union Territories ──────────────────────────────────────────────
  {
    name: "Andaman and Nicobar Islands",
    districts: [
      {
        name: "South Andaman",
        pincodes: [
          { code: "744101", name: "Port Blair HO" },
          { code: "744103", name: "Port Blair Town" },
        ],
      },
    ],
  },
  {
    name: "Chandigarh",
    districts: [
      {
        name: "Chandigarh",
        pincodes: [
          { code: "160001", name: "Chandigarh HO" },
          { code: "160017", name: "Sector 17 Chandigarh" },
          { code: "160019", name: "Sector 19 Chandigarh" },
          { code: "160022", name: "Sector 22 Chandigarh" },
        ],
      },
    ],
  },
  {
    name: "Dadra and Nagar Haveli and Daman and Diu",
    districts: [
      {
        name: "Daman",
        pincodes: [
          { code: "396210", name: "Daman HO" },
          { code: "396215", name: "Daman Town" },
        ],
      },
      {
        name: "Silvassa",
        pincodes: [
          { code: "396230", name: "Silvassa HO" },
        ],
      },
    ],
  },
  {
    name: "Delhi",
    districts: [
      {
        name: "Central Delhi",
        pincodes: [
          { code: "110001", name: "New Delhi GPO" },
          { code: "110002", name: "Chandni Chowk" },
          { code: "110003", name: "Karol Bagh" },
          { code: "110006", name: "Paharganj" },
        ],
      },
      {
        name: "South Delhi",
        pincodes: [
          { code: "110016", name: "Hauz Khas" },
          { code: "110017", name: "Saket" },
          { code: "110024", name: "Lajpat Nagar" },
          { code: "110048", name: "Greater Kailash" },
          { code: "110062", name: "Mehrauli" },
          { code: "110068", name: "Vasant Kunj" },
        ],
      },
      {
        name: "West Delhi",
        pincodes: [
          { code: "110018", name: "Rajouri Garden" },
          { code: "110027", name: "Subhash Nagar" },
          { code: "110041", name: "Janakpuri" },
          { code: "110063", name: "Dwarka" },
        ],
      },
      {
        name: "North Delhi",
        pincodes: [
          { code: "110007", name: "Civil Lines Delhi" },
          { code: "110009", name: "Sadar Bazaar" },
          { code: "110033", name: "Azadpur" },
          { code: "110054", name: "Rohini" },
        ],
      },
      {
        name: "East Delhi",
        pincodes: [
          { code: "110051", name: "Shahdara" },
          { code: "110092", name: "Patparganj" },
          { code: "110096", name: "Vasundhara Enclave" },
        ],
      },
    ],
  },
  {
    name: "Jammu and Kashmir",
    districts: [
      {
        name: "Jammu",
        pincodes: [
          { code: "180001", name: "Jammu HO" },
          { code: "180004", name: "Gandhi Nagar Jammu" },
          { code: "180005", name: "Parade Jammu" },
        ],
      },
      {
        name: "Srinagar",
        pincodes: [
          { code: "190001", name: "Srinagar HO" },
          { code: "190008", name: "Lal Chowk" },
          { code: "190011", name: "Dalgate" },
        ],
      },
    ],
  },
  {
    name: "Ladakh",
    districts: [
      {
        name: "Leh",
        pincodes: [
          { code: "194101", name: "Leh HO" },
          { code: "194104", name: "Leh Town" },
        ],
      },
    ],
  },
  {
    name: "Lakshadweep",
    districts: [
      {
        name: "Kavaratti",
        pincodes: [
          { code: "682555", name: "Kavaratti HO" },
        ],
      },
    ],
  },
  {
    name: "Puducherry",
    districts: [
      {
        name: "Puducherry",
        pincodes: [
          { code: "605001", name: "Puducherry HO" },
          { code: "605005", name: "Nellithope" },
          { code: "605008", name: "Mudaliarpet" },
        ],
      },
      {
        name: "Karaikal",
        pincodes: [
          { code: "609602", name: "Karaikal HO" },
        ],
      },
    ],
  },
];

/** Returns all state names sorted alphabetically. */
export function getStates(): string[] {
  return INDIA_LOCATIONS.map(s => s.name).sort();
}

/** Returns districts for a given state name. */
export function getDistricts(stateName: string): string[] {
  const state = INDIA_LOCATIONS.find(s => s.name === stateName);
  return state ? state.districts.map(d => d.name).sort() : [];
}

/** Returns pincodes for a given state + district. */
export function getPincodes(stateName: string, districtName: string): PincodeEntry[] {
  const state = INDIA_LOCATIONS.find(s => s.name === stateName);
  if (!state) return [];
  const district = state.districts.find(d => d.name === districtName);
  return district ? district.pincodes : [];
}
