const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'training', 'chatbot-training.json');
const rawData = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(rawData);

const mapping = {
  "chatbot_vibro_not_working_not_on_led": { title: "Not Working (No LED)", desc: "Vibro machine is not working or LED is off" },
  "chatbot_vibro_machine_continiously_vibrating": { title: "Continuous Vibrating", desc: "Machine is continuously vibrating" },
  "chatbot_vibro_low_vibration": { title: "Low Vibration", desc: "Vibration is too low" },
  "chatbot_compact_adapter_adapter_output_voltage_is_nill": { title: "No Output Voltage", desc: "Adapter output voltage is nil" },
  "chatbot_charger_adapter_adapter_output_voltage_is_nill": { title: "No Output Voltage", desc: "Adapter output voltage is nil" },
  "chatbot_analyzer_analyzer_not_on": { title: "Analyzer Not On", desc: "Analyzer is not turning on" },
  "chatbot_analyzer_low_battery_error_shown": { title: "Low Battery Error", desc: "Low battery error is shown" },
  "chatbot_analyzer_t2_temp_set_error_sample_not_found_air_in_milk": { title: "T2/Temp Set Error", desc: "T2/Temp set error, sample not found, or air in milk" },
  "chatbot_analyzer_plunge_in_water_water_in_sensor": { title: "Water In Sensor", desc: "Plunge in water or water in sensor" },
  "chatbot_analyzer_hot_sample_error": { title: "Hot Sample Error", desc: "Hot sample error is shown" },
  "chatbot_analyzer_pen_drive_and_keyboard_not_detected": { title: "USB/Keyboard Error", desc: "Pen-drive and keyboard not detected" },
  "chatbot_analyzer_wifi_gsm_error_shown": { title: "WiFi/GSM Error", desc: "WiFi/GSM error is shown" },
  "chatbot_analyzer_date_and_time_not_shown_correct": { title: "Date/Time Incorrect", desc: "Date and time not shown correctly" },
  "chatbot_analyzer_computer_output_not_present": { title: "No Computer Output", desc: "Computer output not present" },
  "chatbot_analyzer_external_display_not_showing_the_result": { title: "No External Display", desc: "External display not showing the result" },
  "chatbot_analyzer_fat_shown_in_water": { title: "Fat Shown In Water", desc: "Fat shown in water" },
  "chatbot_analyzer_reading_variation": { title: "Reading Variation", desc: "Reading variation in the analyzer" },
  "chatbot_analyzer_sms_not_send_to_the_farmer": { title: "SMS Not Sent", desc: "SMS not sent to the farmer" },
  "chatbot_analyzer_farmer_details_not_shown": { title: "Farmer Details Missing", desc: "Farmer details not shown" },
  "chatbot_analyzer_printer_is_not_print": { title: "Printer Not Printing", desc: "Printer is not printing" },
  "chatbot_analyzer_weighing_scale_not_working": { title: "Scale Not Working", desc: "Weighing scale not working" },
  "chatbot_analyzer_rate_not_taken_from_the_chart_not_view": { title: "Rate Chart Error", desc: "Rate not taken from the chart or not viewing" },
  "chatbot_analyzer_tested_result_to_cloud_updation_error_shown": { title: "Cloud Sync Error", desc: "Tested result to cloud updation error shown" }
};

data.intents.forEach(intent => {
  const mapped = mapping[intent.tag];
  if (mapped) {
    intent.title = mapped.title;
    intent.description = mapped.desc;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Successfully updated chatbot-training.json');
