# Persian Subtitles Add-on for Stremio

A high-performance, scalable add-on that provides Persian (Farsi) subtitles from the SubSource API. Designed to handle thousands of concurrent users with optimized request handling and efficient resource management.

## Features

- **High Performance**: Clustered architecture utilizing all CPU cores
- **Scalable**: Handles thousands of concurrent requests
- **Smart Matching**: Advanced episode detection for TV series
- **Production Ready**: Graceful shutdown, health checks, and error handling
- **Configurable**: Environment-based configuration
- **Monitored**: Request logging and health endpoints

## Installation

### Prerequisites

- Node.js >= 14.0.0
- npm or yarn
- SubSource API key (get one at [SubSource](https://subsource.net))

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd subsource-stremio-addon
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and set your configuration:
```env
SERVER_IP=your-server-ip-or-domain
PORT=7000
API_KEY=your-subsource-api-key
CLUSTER_ENABLED=true
```

## Usage

### Development Mode (Single Process)
```bash
npm run dev
```

### Production Mode (Clustered)
```bash
npm start
```

This will spawn worker processes equal to the number of CPU cores available.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_IP` | `127.0.0.1` | Server IP address or domain |
| `PORT` | `7000` | Server port |
| `API_KEY` | - | SubSource API key (required) |
| `CLUSTER_ENABLED` | `false` | Enable multi-process clustering |
| `WORKER_COUNT` | `0` | Number of workers (0 = auto-detect) |
| `LONG_TIMEOUT` | `60000` | API timeout in ms |
| `RATE_LIMIT_ENABLED` | `false` | Enable rate limiting |
| `CACHE_ENABLED` | `false` | Enable Redis caching |

## Deployment

### Docker Deployment

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 7000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t persian-subtitles-addon .
docker run -d -p 7000:7000 --env-file .env persian-subtitles-addon
```

### Load Balancer Setup

For handling massive scale (10,000+ concurrent users):

1. Deploy multiple instances behind a load balancer (nginx, HAProxy, etc.)
2. Enable clustering on each instance
3. Configure health checks pointing to `/health` endpoint
4. Set up SSL termination at the load balancer

Example nginx configuration:
```nginx
upstream stremio_addon {
    server 10.0.0.1:7000;
    server 10.0.0.2:7000;
    server 10.0.0.3:7000;
}

server {
    listen 443 ssl;
    server_name addons.yourdomain.com;
    
    location / {
        proxy_pass http://stremio_addon;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    location /health {
        proxy_pass http://stremio_addon/health;
    }
}
```

## API Endpoints

- `GET /manifest.json` - Add-on manifest for Stremio
- `GET /subtitles/{type}/{id}.json` - Fetch subtitles for content
- `GET /download/{token}` - Download subtitle file
- `GET /health` - Health check endpoint

## Monitoring

### Health Check
```bash
curl http://localhost:7000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600,
  "memory": { "rss": 104857600, "heapUsed": 52428800 },
  "cpuLoad": 0.5
}
```

### Logs
The application logs all requests with timestamps and response times:
```
[2024-01-01T12:00:00.000Z] GET /manifest.json - 200 (15ms)
[2024-01-01T12:00:01.000Z] GET /subtitles/movie/tt1234567.json - 200 (234ms)
```

## Performance Optimization Tips

1. **Enable Clustering**: Set `CLUSTER_ENABLED=true` for production
2. **Use a CDN**: Cache static responses at the edge
3. **Redis Caching**: Enable `CACHE_ENABLED=true` with Redis for repeated requests
4. **Rate Limiting**: Protect against abuse with `RATE_LIMIT_ENABLED=true`
5. **Connection Pooling**: Tune `MAX_SOCKETS` based on your server capacity
6. **Load Balancing**: Deploy multiple instances for horizontal scaling

## Troubleshooting

### Common Issues

**API Key Missing**
```
Error: API Key is missing from .env file.
```
Solution: Ensure `API_KEY` is set in your `.env` file.

**Port Already in Use**
```
Error: listen EADDRINUSE: address already in use :::7000
```
Solution: Change the `PORT` in `.env` or stop the process using port 7000.

**Worker Crashes**
The cluster manager automatically restarts crashed workers. Check logs for error details.

## License

ISC

## Author

Ali Rostami

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.
