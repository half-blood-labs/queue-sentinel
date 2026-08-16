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
Sleep 5s

Type "clear"
Enter

Type "docker compose logs -f watcher"
Enter
Sleep 65s
