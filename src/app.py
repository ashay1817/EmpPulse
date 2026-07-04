import os
import joblib
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__, 
            static_folder='static', 
            template_folder='templates')

# Disable static file caching so browsers always load fresh JS/CSS
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Define paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # C:\EmpPulse
DATA_PATH = os.path.join(BASE_DIR, 'data', 'cleaned_employee_data.csv')
PLOTS_DIR = os.path.join(BASE_DIR, 'reports', 'plots')
SRC_DIR  = os.path.join(BASE_DIR, 'src')
PREPROCESSOR_PATH = os.path.join(SRC_DIR, 'preprocessor.joblib')

# Available models: key -> (joblib filename, display label, metrics)
MODEL_REGISTRY = {
    'random_forest': {
        'file': 'random_forest.joblib',
        'label': 'Random Forest Regressor',
        'r2': 0.8926, 'mae': 0.1520, 'rmse': 0.2085
    },
    'linear_regression': {
        'file': 'linear_regression.joblib',
        'label': 'Linear Regression',
        'r2': 0.8889, 'mae': 0.1561, 'rmse': 0.2121
    },
    'decision_tree': {
        'file': 'decision_tree.joblib',
        'label': 'Decision Tree Regressor',
        'r2': 0.8153, 'mae': 0.2037, 'rmse': 0.2734
    },
}

# Load all assets
try:
    df_employees = pd.read_csv(DATA_PATH)
    preprocessor = joblib.load(PREPROCESSOR_PATH)
    models = {}
    for key, meta in MODEL_REGISTRY.items():
        path = os.path.join(SRC_DIR, meta['file'])
        models[key] = joblib.load(path)
    print(f"Loaded dataset ({len(df_employees)} rows) and {len(models)} models.")
except Exception as e:
    print(f"Error loading initial assets: {e}")
    df_employees = pd.DataFrame()
    preprocessor = None
    models = {}

# Root Route: Serve the SPA dashboard
@app.route('/')
def index():
    return render_template('index.html')

# Endpoint: List available models
@app.route('/api/models', methods=['GET'])
def get_models():
    result = []
    for key, meta in MODEL_REGISTRY.items():
        result.append({
            'key': key,
            'label': meta['label'],
            'r2': meta['r2'],
            'mae': meta['mae'],
            'rmse': meta['rmse']
        })
    return jsonify({'models': result})

# Endpoint: Serve pre-generated plots
@app.route('/api/plots/<path:filename>')
def get_plot(filename):
    if not os.path.exists(os.path.join(PLOTS_DIR, filename)):
        return jsonify({"error": "Plot not found"}), 404
    return send_from_directory(PLOTS_DIR, filename)

# Endpoint: Aggregated stats for the overview panel
@app.route('/api/stats', methods=['GET'])
def get_stats():
    if df_employees.empty:
        return jsonify({"error": "Data not loaded"}), 500
    
    total_employees = int(len(df_employees))
    avg_performance = float(df_employees['Performance Rating'].mean())
    avg_salary = float(df_employees['Salary'].mean())
    avg_attendance = float(df_employees['Attendance Percentage'].mean())
    promotion_rate = float(df_employees['Promotion Status'].mean() * 100)
    
    # Department breakdown
    dept_counts = df_employees['Department'].value_counts().to_dict()
    dept_performance = df_employees.groupby('Department')['Performance Rating'].mean().to_dict()
    dept_salary = df_employees.groupby('Department')['Salary'].mean().to_dict()
    
    # Manager rating distribution
    manager_ratings = df_employees['Manager Rating'].value_counts().sort_index().to_dict()
    
    # Format department metrics
    departments_summary = []
    for dept in dept_counts.keys():
        departments_summary.append({
            "name": dept,
            "count": int(dept_counts[dept]),
            "avg_performance": round(float(dept_performance[dept]), 2),
            "avg_salary": round(float(dept_salary[dept]), 2)
        })
        
    return jsonify({
        "total_employees": total_employees,
        "avg_performance": round(avg_performance, 2),
        "avg_salary": round(avg_salary, 2),
        "avg_attendance": round(avg_attendance, 2),
        "promotion_rate": round(promotion_rate, 2),
        "departments": departments_summary,
        "manager_ratings": {str(k): int(v) for k, v in manager_ratings.items()}
    })

# Endpoint: Query and search employee directory
@app.route('/api/employees', methods=['GET'])
def get_employees():
    if df_employees.empty:
        return jsonify({"error": "Data not loaded"}), 500
        
    # Get parameters
    page = request.args.get('page', default=1, type=int)
    limit = request.args.get('limit', default=10, type=int)
    search = request.args.get('search', default='', type=str).strip()
    department = request.args.get('department', default='', type=str)
    gender = request.args.get('gender', default='', type=str)
    
    # Filter
    filtered_df = df_employees.copy()
    if search:
        filtered_df = filtered_df[filtered_df['Employee ID'].str.contains(search, case=False, na=False)]
    if department and department != 'All':
        filtered_df = filtered_df[filtered_df['Department'] == department]
    if gender and gender != 'All':
        filtered_df = filtered_df[filtered_df['Gender'] == gender]
        
    total_records = len(filtered_df)
    total_pages = max(1, int(np.ceil(total_records / limit)))
    
    # Paginate
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_df = filtered_df.iloc[start_idx:end_idx]
    
    # Convert records
    records = paginated_df.to_dict(orient='records')
    # Round float fields for display
    for r in records:
        r['Salary'] = round(r['Salary'], 2)
        r['Attendance Percentage'] = round(r['Attendance Percentage'], 2)
        r['Performance Rating'] = round(r['Performance Rating'], 2)
        
    return jsonify({
        "employees": records,
        "total": total_records,
        "page": page,
        "pages": total_pages,
        "limit": limit
    })

# Endpoint: ML Performance Rating Predictor
@app.route('/api/predict', methods=['POST'])
def predict():
    if not models or preprocessor is None:
        return jsonify({"error": "ML pipeline is not loaded or configured."}), 500
        
    try:
        data = request.get_json()
        
        # Model selection (defaults to random_forest)
        model_key = data.get('model', 'random_forest')
        if model_key not in models:
            return jsonify({"error": f"Unknown model '{model_key}'. Choose from: {list(models.keys())}"}), 400
        selected_model = models[model_key]
        selected_label = MODEL_REGISTRY[model_key]['label']
        
        # Required fields check
        required_fields = [
            'Age', 'Gender', 'Department', 'Experience', 'Salary', 
            'Attendance Percentage', 'Training Hours', 'Projects Completed', 
            'Overtime Hours', 'Manager Rating', 'Promotion Status'
        ]
        
        missing = [f for f in required_fields if f not in data]
        if missing:
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
            
        # Parse & Cast values
        input_data = pd.DataFrame([{
            'Age': int(data['Age']),
            'Gender': str(data['Gender']),
            'Department': str(data['Department']),
            'Experience': int(data['Experience']),
            'Salary': float(data['Salary']),
            'Attendance Percentage': float(data['Attendance Percentage']),
            'Training Hours': int(data['Training Hours']),
            'Projects Completed': int(data['Projects Completed']),
            'Overtime Hours': int(data['Overtime Hours']),
            'Manager Rating': int(data['Manager Rating']),
            'Promotion Status': int(data['Promotion Status'])
        }])
        
        # Run through preprocessor and predict
        X_transformed = preprocessor.transform(input_data)
        prediction = selected_model.predict(X_transformed)[0]
        prediction_val = round(float(prediction), 3)
        
        # Calculate comparison metrics
        avg_rating = float(df_employees['Performance Rating'].mean())
        diff_from_avg = round(prediction_val - avg_rating, 3)
        percentile = round(float((df_employees['Performance Rating'] < prediction_val).mean() * 100), 1)
        
        # Generate custom insights
        insights = []
        if float(data['Attendance Percentage']) < 90.0:
            insights.append("Low attendance (< 90%) might be dragging down the rating. Encourage better attendance.")
        if int(data['Training Hours']) < 30:
            insights.append("Training hours are low (< 30h). Enrolling in professional development courses could improve rating.")
        if int(data['Manager Rating']) <= 2:
            insights.append("Low Manager Rating. Performance shows misalignment with supervisor expectations.")
        elif int(data['Manager Rating']) >= 4:
            insights.append("High Manager Rating. Strong positive relationship and approval from direct supervisor.")
        if int(data['Overtime Hours']) > 45:
            insights.append("Very high overtime hours. Monitor closely to avoid burnout, despite high output.")
        if int(data['Projects Completed']) >= 8:
            insights.append("High volume of completed projects demonstrates strong execution capability.")
            
        if not insights:
            insights.append("Employee shows balanced metrics matching standard organizational expectations.")
            
        return jsonify({
            "predicted_rating": prediction_val,
            "average_rating": round(avg_rating, 3),
            "difference_from_average": diff_from_avg,
            "percentile": percentile,
            "model_used": selected_label,
            "model_key": model_key,
            "insights": insights
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to calculate prediction: {str(e)}"}), 500

if __name__ == '__main__':
    # Run the server on port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
