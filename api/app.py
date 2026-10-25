from flask import Flask, jsonify
import requests

app = Flask(__name__)

DB_HOST = "db"
DB_PORT = 5432

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "service": "api"})

@app.route('/ping')
def ping():
    return jsonify({"message": "pong", "service": f"api running on {DB_HOST}:{DB_PORT}"})

@app.route('/db')
def db_status():
    try:
        # Intentar conectar a la base de datos
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        result = sock.connect_ex((DB_HOST, DB_PORT))
        sock.close()
        
        if result == 0:
            return jsonify({"db": "reachable", "host": DB_HOST, "port": DB_PORT})
        else:
            return jsonify({"db": "unreachable", "host": DB_HOST, "port": DB_PORT}), 503
    except Exception as e:
        return jsonify({"db": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)