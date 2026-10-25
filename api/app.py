from flask import Flask, jsonify
import platform
import socket
import time

app = Flask(__name__)

DB_HOST = "db"
DB_PORT = 5432
STARTED_AT = time.time()


@app.route('/')
def index():
    return jsonify({
        "service": "api",
        "endpoints": ["/health", "/ping", "/db", "/info"],
    })


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


@app.route('/info')
def info():
    """Datos de runtime que consume el panel de la app."""
    return jsonify({
        "service": "api",
        "hostname": socket.gethostname(),
        "python": platform.python_version(),
        "platform": platform.system(),
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        "db_target": f"{DB_HOST}:{DB_PORT}",
        "front_ip": "172.28.10.20",
        "back_ip": "172.28.20.30",
        "server_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
