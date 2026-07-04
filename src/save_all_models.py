"""
Retrain and save all 3 models so the app can switch between them.
Existing best_model.joblib (Random Forest) is kept as-is.
"""
import os
import joblib
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, 'data', 'cleaned_employee_data.csv')
SRC_DIR = os.path.join(BASE_DIR, 'src')
PREPROCESSOR_PATH = os.path.join(SRC_DIR, 'preprocessor.joblib')

df = pd.read_csv(DATA_PATH)

FEATURES = ['Age', 'Gender', 'Department', 'Experience', 'Salary',
            'Attendance Percentage', 'Training Hours', 'Projects Completed',
            'Overtime Hours', 'Manager Rating', 'Promotion Status']
TARGET = 'Performance Rating'

X = df[FEATURES]
y = df[TARGET]

preprocessor = joblib.load(PREPROCESSOR_PATH)
X_transformed = preprocessor.transform(X)

X_train, X_test, y_train, y_test = train_test_split(
    X_transformed, y, test_size=0.2, random_state=42)

models = {
    'linear_regression': LinearRegression(),
    'decision_tree': DecisionTreeRegressor(max_depth=8, random_state=42),
    'random_forest': RandomForestRegressor(max_depth=8, random_state=42),
}

for name, model in models.items():
    model.fit(X_train, y_train)
    save_path = os.path.join(SRC_DIR, f'{name}.joblib')
    joblib.dump(model, save_path)
    print(f"Saved: {save_path}")

print("\nAll models saved successfully.")
