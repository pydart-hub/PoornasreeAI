import pandas as pd
file_path = r"C:\Users\abhis\OneDrive\Desktop\PoornasreeAI\docs\Engineers Training.xlsx"
try:
    df = pd.read_excel(file_path)
    print("Columns:", list(df.columns))
    if "tag" in df.columns or "tag " in df.columns:
        tag_col = "tag" if "tag" in df.columns else "tag "
        print("Unique tags:", df[tag_col].unique())
    else:
        print("No tag column found. Here are all columns:")
        print(df.columns)
except Exception as e:
    print("Error:", str(e))
