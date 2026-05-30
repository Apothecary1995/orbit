package push

import (
	"encoding/json"
	"log"
	"sync"

	webpush "github.com/SherClockHolmes/webpush-go"
)

type Subscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

type Manager struct {
	mu          sync.RWMutex
	subs        map[string][]Subscription // userID → subscriptions
	vapidPub    string
	vapidPriv   string
	vapidSub    string
}

func NewManager(pub, priv, subject string) *Manager {
	return &Manager{
		subs:      make(map[string][]Subscription),
		vapidPub:  pub,
		vapidPriv: priv,
		vapidSub:  subject,
	}
}

func (m *Manager) Save(userID string, sub Subscription) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, existing := range m.subs[userID] {
		if existing.Endpoint == sub.Endpoint {
			return
		}
	}
	m.subs[userID] = append(m.subs[userID], sub)
}

func (m *Manager) Send(userID string, payload interface{}) {
	m.mu.RLock()
	subs := make([]Subscription, len(m.subs[userID]))
	copy(subs, m.subs[userID])
	m.mu.RUnlock()

	if len(subs) == 0 {
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	for _, sub := range subs {
		wSub := &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys: webpush.Keys{
				P256dh: sub.Keys.P256dh,
				Auth:   sub.Keys.Auth,
			},
		}
		resp, err := webpush.SendNotification(data, wSub, &webpush.Options{
			VAPIDPublicKey:  m.vapidPub,
			VAPIDPrivateKey: m.vapidPriv,
			Subscriber:      m.vapidSub,
			TTL:             60,
		})
		if err != nil {
			log.Printf("push gönderilemedi %s: %v", userID, err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode >= 400 {
			log.Printf("push reddedildi %s: %d", userID, resp.StatusCode)
			if resp.StatusCode == 410 || resp.StatusCode == 404 {
				m.removeSub(userID, sub.Endpoint)
			}
		}
	}
}

func (m *Manager) PublicKey() string {
	return m.vapidPub
}

func (m *Manager) removeSub(userID, endpoint string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	subs := m.subs[userID]
	filtered := subs[:0]
	for _, s := range subs {
		if s.Endpoint != endpoint {
			filtered = append(filtered, s)
		}
	}
	m.subs[userID] = filtered
}
