-- Rol sistemi: server_members tablosuna role kolonu ekle

ALTER TABLE server_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

-- Davet kodu ile katılan sahibini 'owner' yap (var olan veriler için)
-- Yeni serverlar için owner'lar zaten 'owner' olarak eklenecek
UPDATE server_members sm
SET role = 'owner'
FROM servers s
WHERE sm.server_id = s.id AND sm.user_id = s.owner_id;

CREATE INDEX IF NOT EXISTS idx_server_members_role ON server_members(server_id, role);
