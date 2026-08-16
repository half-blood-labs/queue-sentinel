Output demo/recording/queue-sentinel-demo.gif
Output demo/recording/queue-sentinel-demo.mp4

Set Shell "zsh"
Set FontSize 16
Set Width 1300
Set Height 800
Set Theme "Dracula"
Set TypingSpeed 50ms
Set Padding 20

Type "PS1='$ '"
Enter
Sleep 500ms
Type "clear"
Enter

Type "echo 'Queue Sentinel: AI triage for RabbitMQ dead-letter queues'"
Enter
Sleep 1s

Type "docker compose up -d"
Enter
Sleep 3s

Type "until docker compose exec -T rabbitmq rabbitmq-diagnostics ping >/dev/null 2>&1; do sleep 1; done; echo rabbitmq ready"
Enter
Sleep 15s
Sleep 2s

Type "clear"
Enter

Type "docker compose logs -f worker"
Enter
Sleep 6s
Ctrl+C
Sleep 500ms

Type "clear"
Enter

Type "node bin/queue-sentinel.js --amqp-url amqp://guest:guest@localhost:5672 --exchange orders.dlx --window 20"
Enter
Sleep 25s
Sleep 3s
