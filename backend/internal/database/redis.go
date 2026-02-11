package database

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisClients struct {
	Queue  *redis.Client
	PubSub *redis.Client
}

func NewRedisClients(redisURL string) (*RedisClients, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Queue client
	queueClient := redis.NewClient(opt)
	if err := queueClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping Redis (queue): %w", err)
	}

	// PubSub client (separate connection)
	pubsubOpt := *opt
	pubsubClient := redis.NewClient(&pubsubOpt)
	if err := pubsubClient.Ping(ctx).Err(); err != nil {
		queueClient.Close()
		return nil, fmt.Errorf("failed to ping Redis (pubsub): %w", err)
	}

	return &RedisClients{
		Queue:  queueClient,
		PubSub: pubsubClient,
	}, nil
}

func (r *RedisClients) Close() {
	r.Queue.Close()
	r.PubSub.Close()
}
