# Customer Training Document Audit & Vibro Troubleshooting Specification

This document provides an exhaustive breakdown of the Customer Training Document (`CHATBOT_DATAS` uploaded via Admin Panel), detailing all **Vibro Ultrasonic Stirrer** complaints, checks, actions, and the full spectrum of colloquial inputs typed by uneducated dairy farmers and customers.

---

## 1. Vibro Ultrasonic Stirrer Complaints Breakdown

### Complaint 1: NOT WORKING (NOT ON LED) / Vibro Power Failure
- **Document Title**: `NOT WORKING (NOT ON LED)`
- **Problem Type**: `chatbot_vibro_not_working_not_on_led`
- **Target Audience**: Customer
- **Exact Document Steps**:
  - **Step 1**: `Check: CHECK THE FUSE → Action: REPLACE FUSE`
  - **Step 2**: `Check: CHECK THE POWER SUPPLY / ADAPTER → Action: REPLACE POWER SUPPLY`
- **Uneducated / Casual Customer Input Phrases**:
  - *"vibro nahi chal raha"*
  - *"vibro light nahi jala"*
  - *"vibro power on nahi ho raha"*
  - *"vibro completely dead"*
  - *"vibro adapter plug kiya light nahi aa rahi"*
  - *"vibro work nahi kar raha"*
  - *"vibro samasya light off"*
  - *"vibro on cheythu light illa"* (Malayalam/Manglish)
  - *"vibro velicham illa"*

---

### Complaint 2: LOW VIBRATION / Weak Stirrer Mixing
- **Document Title**: `LOW VIBRATION`
- **Problem Type**: `chatbot_vibro_low_vibration`
- **Target Audience**: Customer
- **Exact Document Steps**:
  - **Step 1**: `Check: CHECK THE FREQUENCY POT POSITION → Action: ADJUST THE FREQUENCY POT`
  - **Step 2**: `Check: CHECK THE SUPPLY ADAPTER-LED IS ON → Action: REPLACE POWER SUPPLY`
- **Uneducated / Casual Customer Input Phrases**:
  - *"vibro vibration low"*
  - *"vibro slow hila raha hai"*
  - *"vibro kam vibration ho raha hai"*
  - *"vibro weak vibration"*
  - *"vibro spandana kam hai"*
  - *"vibro slow mixing"*
  - *"vibro milk not mixing properly"*
  - *"vibro vibration kuraivu"* (Tamil)
  - *"vibro speed illa"* (Manglish)

---

### Complaint 3: MACHINE CONTINUOUSLY VIBRATING / Won't Stop
- **Document Title**: `MACHINE CONTINIOUSLY VIBRATING`
- **Problem Type**: `chatbot_vibro_machine_continiously_vibrating`
- **Target Audience**: Customer
- **Exact Document Steps**:
  - **Step 1**: `Check: CHECK THE TIMER POT. POSITION → Action: ADJUST THE TIMER POT`
- **Uneducated / Casual Customer Input Phrases**:
  - *"vibro continuously vibrating"*
  - *"vibro band nahi ho raha continuous hila raha hai"*
  - *"vibro ruka nahi full time vibration"*
  - *"vibro vibrating non stop"*
  - *"vibro timer problem"*
  - *"vibro off nahi hota"*
  - *"vibro thodarchiyaaga vibrator aagudhu"* (Tamil)

---

### Complaint 4: LED BLINKING / ON-OFF ONLY (No Vibration)
- **Document Title**: `VIBRO is not working but LED just goes on and off`
- **Problem Type**: `customer_vibro_led_on_off`
- **Target Audience**: Customer
- **Exact Document Steps**:
  - **Step 1**: `Unplug the adapter, wait 10 seconds, and plug it back in.`
  - **Step 2**: `Check that the stirrer tip is properly and firmly attached to the machine.`
- **Uneducated / Casual Customer Input Phrases**:
  - *"vibro light blink ho raha hai"*
  - *"vibro led on off ho raha h vibration nahi h"*
  - *"vibro light aati jaati hai"*
  - *"vibro led flashing"*
  - *"vibro light blinking but no work"*

---

### Complaint 5: STIRRER ONLY WORKS WHEN PLUGGING ADAPTER (Button Failure)
- **Document Title**: `Stirrer working only during adapter plugging time`
- **Problem Type**: `customer_vibro_stirrer_only_on_adapter_plugging`
- **Target Audience**: Customer
- **Exact Document Steps**:
  - **Step 1**: `Check the push button switch → Replace push button switch`
- **Uneducated / Casual Customer Input Phrases**:
  - *"vibro switch button not working"*
  - *"vibro plug lagane par hi chalta h button dabane par nahi"*
  - *"vibro push button problem"*
  - *"vibro button chalta nahi"*

---

## 2. All 23 Customer Document Issues Summary (`CHATBOT_DATAS`)

| Sl | Document Issue Title | Primary Problem Type | Key Checks & Actions |
|---|---|---|---|
| 1 | **ANALYZER NOT ON** | `chatbot_analyzer_analyzer_not_on` | 1. Check Fuse → Replace Fuse<br>2. Check Adapter → Replace Adapter |
| 2 | **LOW BATTERY ERROR SHOWN** | `chatbot_analyzer_low_battery_error_shown` | 1. Check Adapter Output → Replace Adapter<br>2. Check Fuse → Replace Fuse |
| 3 | **T2/TEMP.SET ERROR/SAMPLE NOT FOUND/AIR IN MILK** | `chatbot_analyzer_t2_temp_set_error_sample_not_found_air_in_milk` | 1. Check Leakage/Block in Sample Sucking Section → Check Silicon Tube<br>2. Check L-Plug → Check O-Ring |
| 4 | **PLUNGE IN WATER/WATER IN SENSOR** | `chatbot_analyzer_plunge_in_water_water_in_sensor` | 1. Check Sample Liquid in Sensor Tube → Remove Liquid & Manually Plunge |
| 5 | **HOT SAMPLE ERROR** | `chatbot_analyzer_hot_sample_error` | 1. Check Test Sample Temp Below 40°C → Replace Sample |
| 6 | **READING VARIATION** | `chatbot_analyzer_reading_variation` | 1. Check Leakage/Block → Correct Sample Sucking Sections<br>2. Check Silicon Tube Broken/Bend |
| 7 | **FAT SHOWN IN WATER** | `chatbot_analyzer_fat_shown_in_water` | 1. Check Test Readings → Check Calibration<br>2. Clean Sensor & Tube<br>3. Apply Water Zero Operation |
| 8 | **WIFI/GSM ERROR SHOWN** | `chatbot_analyzer_wifi_gsm_error_shown` | 1. Check WiFi/GSM Settings<br>2. Check Antenna Connection |
| 9 | **PEN-DRIVE AND KEYBOARD NOT DETECTED** | `chatbot_analyzer_pen_drive_and_keyboard_not_detected` | 1. Check USB Setting |
| 10 | **PRINTER IS NOT PRINT** | `chatbot_analyzer_printer_is_not_print` | 1. Check Printer Settings |
| 11 | **WEIGHING SCALE NOT WORKING** | `chatbot_analyzer_weighing_scale_not_working` | 1. Check Required Settings<br>2. Check Cable Connectivity |
| 12 | **RATE NOT TAKEN FROM THE CHART** | `chatbot_analyzer_rate_not_taken_from_the_chart_not_view` | 1. Check Rate Chart Settings |
| 13 | **FARMER DETAILS NOT SHOWN** | `chatbot_analyzer_farmer_details_not_shown` | 1. Check Farmer Details Settings |
| 14 | **SMS NOT SEND TO THE FARMER** | `chatbot_analyzer_sms_not_send_to_the_farmer` | 1. Check GSM SIM Connectivity & Validity<br>2. Check Farmer Details & SMS Enable Settings |
| 15 | **TESTED RESULT TO CLOUD UPDATION ERROR** | `chatbot_analyzer_tested_result_to_cloud_updation_error_shown` | 1. Check WiFi/GSM Connectivity<br>2. Check Cloud Details & Machine ID Registration |
| 16 | **EXTERNAL DISPLAY NOT SHOWING RESULT** | `chatbot_analyzer_external_display_not_showing_the_result` | 1. Check Data Format Settings<br>2. Check Cable Connectivity |
| 17 | **COMPUTER OUTPUT NOT PRESENT** | `chatbot_analyzer_computer_output_not_present` | 1. Check Data Output Format<br>2. Check Computer Cable |
| 18 | **DATE AND TIME NOT SHOWN CORRECT** | `chatbot_analyzer_date_and_time_not_shown_correct` | 1. Check Clock Settings |
| 19 | **ADAPTER OUTPUT VOLTAGE IS NILL (Charger)** | `chatbot_charger_adapter_adapter_output_voltage_is_nill` | 1. Check Status LED → Check Fuse<br>2. Check AC Cord & Power Switch |
| 20 | **ADAPTER OUTPUT VOLTAGE IS NILL (Compact)** | `chatbot_compact_adapter_adapter_output_voltage_is_nill` | 1. Check Status LED → Replace Adapter<br>2. Check AC Cord & Power Switch |
| 21 | **NOT WORKING (NOT ON LED) [Vibro]** | `chatbot_vibro_not_working_not_on_led` | 1. Check Fuse → Replace Fuse<br>2. Check Power Supply → Replace Power Supply |
| 22 | **LOW VIBRATION [Vibro]** | `chatbot_vibro_low_vibration` | 1. Check Frequency Pot Position → Adjust Frequency Pot<br>2. Check Supply Adapter LED → Replace Power Supply |
| 23 | **MACHINE CONTINUOUSLY VIBRATING [Vibro]** | `chatbot_vibro_machine_continiously_vibrating` | 1. Check Timer Pot Position → Adjust Timer Pot |

---

## 3. Strict Escalation Rule for Unlisted Complaints

If a customer types any complaint or fault that **IS NOT** covered by the 23 Document Issues above (or if classifier confidence is `< 75`), the AI chatbot enforces strict non-hallucination rules:

- **Response Text**:
  > *"We don't have a self-troubleshooting guide for this specific issue in our training documents. 🙏"*
  > *"Please tap Register Complaint below to log a service request for a field service engineer to visit and inspect your machine."*
- **Interactive Action Buttons**:
  - `[🛠️ Register Complaint]`
  - `[💬 Talk to us]`

---

## 4. Verification & System Health

All 23 customer document issues and uneducated customer pattern expansions have been built, deployed, and verified live on production container `poornasree-ai-api-1`.
