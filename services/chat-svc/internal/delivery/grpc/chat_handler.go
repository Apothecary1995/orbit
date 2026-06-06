package grpchandler

import (
	"context"
	"time"

	pb "github.com/Apothecary1995/cengsta-paradise/gen/chat/v1"
	"github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/entity"
	domainUsecase "github.com/Apothecary1995/cengsta-paradise/services/chat-svc/internal/domain/usecase"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ChatHandler struct {
	pb.UnimplementedChatServiceServer
	chatUC domainUsecase.ChatUsecase
}

func NewChatHandler(chatUC domainUsecase.ChatUsecase) *ChatHandler {
	return &ChatHandler{chatUC: chatUC}
}

func (h *ChatHandler) SendMessage(ctx context.Context, req *pb.SendMessageRequest) (*pb.SendMessageResponse, error) {
	if req.ConversationId == "" || req.SenderId == "" || req.Content == "" {
		return nil, status.Error(codes.InvalidArgument, "conversation_id, sender_id ve content zorunlu")
	}

	msgType := entity.MessageType(req.Type)
	if msgType == "" {
		msgType = entity.MessageTypeText
	}

	msg, err := h.chatUC.SendMessage(ctx, domainUsecase.SendMessageInput{
		ConversationID: req.ConversationId,
		SenderID:       req.SenderId,
		Content:        req.Content,
		Type:           msgType,
		ReplyToID:      req.ReplyToId,
	})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.SendMessageResponse{
		MessageId: msg.ID,
		CreatedAt: msg.CreatedAt.Format(time.RFC3339),
	}, nil
}

func (h *ChatHandler) GetHistory(ctx context.Context, req *pb.GetHistoryRequest) (*pb.GetHistoryResponse, error) {
	msgs, err := h.chatUC.GetHistory(ctx, req.ConversationId, int(req.Limit), int(req.Offset))
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	var pbMsgs []*pb.Message
	for _, m := range msgs {
		pbMsg := &pb.Message{
			Id:             m.ID,
			ConversationId: m.ConversationID,
			SenderId:       m.SenderID,
			Type:           string(m.Type),
			Content:        m.Content,
			Status:         string(m.Status),
			ReplyToId:      m.ReplyToID,
			CreatedAt:      m.CreatedAt.Format(time.RFC3339),
		}
		if m.EditedAt != nil {
			pbMsg.EditedAt = m.EditedAt.Format(time.RFC3339)
		}
		if m.DeletedAt != nil {
			pbMsg.Deleted = true
		}
		reactions, _ := h.chatUC.GetReactions(ctx, m.ID)
		for _, r := range reactions {
			pbMsg.Reactions = append(pbMsg.Reactions, &pb.Reaction{
				Emoji:  r.Emoji,
				UserId: r.UserID,
			})
		}
		pbMsgs = append(pbMsgs, pbMsg)
	}

	return &pb.GetHistoryResponse{Messages: pbMsgs}, nil
}

func (h *ChatHandler) AddReaction(ctx context.Context, req *pb.AddReactionRequest) (*pb.AddReactionResponse, error) {
	if req.MessageId == "" || req.UserId == "" || req.Emoji == "" {
		return nil, status.Error(codes.InvalidArgument, "message_id, user_id ve emoji zorunlu")
	}
	if err := h.chatUC.AddReaction(ctx, req.MessageId, req.UserId, req.Emoji); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.AddReactionResponse{Success: true}, nil
}

func (h *ChatHandler) GetConversations(ctx context.Context, req *pb.GetConversationsRequest) (*pb.GetConversationsResponse, error) {
	convs, err := h.chatUC.GetConversations(ctx, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	var pbConvs []*pb.Conversation
	for _, c := range convs {
		pbConvs = append(pbConvs, &pb.Conversation{
			Id:        c.ID,
			Type:      c.Type,
			Name:      c.Name,
			AvatarUrl: c.AvatarURL,
			CreatedBy: c.CreatedBy,
			CreatedAt: c.CreatedAt.Format(time.RFC3339),
		})
	}

	return &pb.GetConversationsResponse{Conversations: pbConvs}, nil
}

func (h *ChatHandler) CreateConversation(ctx context.Context, req *pb.CreateConversationRequest) (*pb.CreateConversationResponse, error) {
	conv, err := h.chatUC.CreateConversation(ctx, domainUsecase.CreateConversationInput{
		Type:      req.Type,
		Name:      req.Name,
		CreatedBy: req.CreatedBy,
		MemberIDs: req.MemberIds,
	})
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	return &pb.CreateConversationResponse{
		Conversation: &pb.Conversation{
			Id:        conv.ID,
			Type:      conv.Type,
			Name:      conv.Name,
			CreatedBy: conv.CreatedBy,
			CreatedAt: conv.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

func (h *ChatHandler) MarkAsRead(ctx context.Context, req *pb.MarkAsReadRequest) (*pb.MarkAsReadResponse, error) {
	if err := h.chatUC.MarkAsRead(ctx, req.MessageId, req.UserId); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.MarkAsReadResponse{Success: true}, nil
}
func (h *ChatHandler) GetMembers(ctx context.Context, req *pb.GetMembersRequest) (*pb.GetMembersResponse, error) {
	members, err := h.chatUC.GetConversationMembers(ctx, req.ConversationId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.GetMembersResponse{MemberIds: members}, nil
}

func (h *ChatHandler) CreateStory(ctx context.Context, req *pb.CreateStoryRequest) (*pb.CreateStoryResponse, error) {
	if req.UserId == "" || req.Content == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id ve content zorunlu")
	}
	storyType := req.Type
	if storyType == "" {
		storyType = "text"
	}
	story, err := h.chatUC.CreateStory(ctx, req.UserId, storyType, req.Content, req.Caption)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.CreateStoryResponse{Story: &pb.Story{
		Id: story.ID, UserId: story.UserID, Type: story.Type,
		Content: story.Content, Caption: story.Caption, Views: int32(story.Views),
		ExpiresAt: story.ExpiresAt.Format(time.RFC3339),
		CreatedAt: story.CreatedAt.Format(time.RFC3339),
	}}, nil
}

func (h *ChatHandler) GetStories(ctx context.Context, req *pb.GetStoriesRequest) (*pb.GetStoriesResponse, error) {
	stories, err := h.chatUC.GetStories(ctx, req.UserIds)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	var pbStories []*pb.Story
	for _, s := range stories {
		pbStories = append(pbStories, &pb.Story{
			Id: s.ID, UserId: s.UserID, Type: s.Type,
			Content: s.Content, Caption: s.Caption, Views: int32(s.Views),
			ExpiresAt: s.ExpiresAt.Format(time.RFC3339),
			CreatedAt: s.CreatedAt.Format(time.RFC3339),
		})
	}
	return &pb.GetStoriesResponse{Stories: pbStories}, nil
}

func (h *ChatHandler) EditMessage(ctx context.Context, req *pb.EditMessageRequest) (*pb.EditMessageResponse, error) {
	if req.MessageId == "" || req.UserId == "" || req.Content == "" {
		return nil, status.Error(codes.InvalidArgument, "message_id, user_id ve content zorunlu")
	}
	if err := h.chatUC.EditMessage(ctx, req.MessageId, req.UserId, req.Content); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.EditMessageResponse{Success: true, EditedAt: time.Now().Format(time.RFC3339)}, nil
}

func (h *ChatHandler) DeleteMessage(ctx context.Context, req *pb.DeleteMessageRequest) (*pb.DeleteMessageResponse, error) {
	if req.MessageId == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "message_id ve user_id zorunlu")
	}
	if err := h.chatUC.DeleteMessage(ctx, req.MessageId, req.UserId); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.DeleteMessageResponse{Success: true}, nil
}

// ── Server handler'ları ──────────────────────────────────

func (h *ChatHandler) CreateServer(ctx context.Context, req *pb.CreateServerRequest) (*pb.CreateServerResponse, error) {
	if req.Name == "" || req.OwnerId == "" {
		return nil, status.Error(codes.InvalidArgument, "name ve owner_id zorunlu")
	}
	s, err := h.chatUC.CreateServer(ctx, req.Name, req.IconUrl, req.OwnerId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.CreateServerResponse{Server: serverToPb(s)}, nil
}

func (h *ChatHandler) GetServer(ctx context.Context, req *pb.GetServerRequest) (*pb.GetServerResponse, error) {
	s, err := h.chatUC.GetServer(ctx, req.ServerId, req.UserId)
	if err != nil {
		return nil, status.Error(codes.NotFound, err.Error())
	}
	return &pb.GetServerResponse{Server: serverToPb(s)}, nil
}

func (h *ChatHandler) ListUserServers(ctx context.Context, req *pb.ListUserServersRequest) (*pb.ListUserServersResponse, error) {
	servers, err := h.chatUC.ListUserServers(ctx, req.UserId)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	var pbServers []*pb.Server
	for _, s := range servers {
		pbServers = append(pbServers, serverToPb(s))
	}
	return &pb.ListUserServersResponse{Servers: pbServers}, nil
}

func (h *ChatHandler) JoinServer(ctx context.Context, req *pb.JoinServerRequest) (*pb.JoinServerResponse, error) {
	if req.InviteCode == "" || req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "invite_code ve user_id zorunlu")
	}
	s, err := h.chatUC.JoinServer(ctx, req.InviteCode, req.UserId)
	if err != nil {
		return nil, status.Error(codes.NotFound, err.Error())
	}
	return &pb.JoinServerResponse{Server: serverToPb(s)}, nil
}

func (h *ChatHandler) DeleteServer(ctx context.Context, req *pb.DeleteServerRequest) (*pb.DeleteServerResponse, error) {
	if err := h.chatUC.DeleteServer(ctx, req.ServerId, req.UserId); err != nil {
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}
	return &pb.DeleteServerResponse{Success: true}, nil
}

// ── Kanal handler'ları ───────────────────────────────────

func (h *ChatHandler) CreateChannel(ctx context.Context, req *pb.CreateChannelRequest) (*pb.CreateChannelResponse, error) {
	if req.Name == "" || req.ServerId == "" || req.OwnerId == "" {
		return nil, status.Error(codes.InvalidArgument, "server_id, name ve owner_id zorunlu")
	}
	chType := req.Type
	if chType != "voice" {
		chType = "text"
	}
	ch, err := h.chatUC.CreateChannel(ctx, req.ServerId, req.Name, req.Topic, req.OwnerId, chType)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &pb.CreateChannelResponse{Channel: channelToPb(ch)}, nil
}

func (h *ChatHandler) ListChannels(ctx context.Context, req *pb.ListChannelsRequest) (*pb.ListChannelsResponse, error) {
	channels, err := h.chatUC.ListChannels(ctx, req.ServerId, req.UserId)
	if err != nil {
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}
	var pbChannels []*pb.Channel
	for _, ch := range channels {
		pbChannels = append(pbChannels, channelToPb(ch))
	}
	return &pb.ListChannelsResponse{Channels: pbChannels}, nil
}

func (h *ChatHandler) DeleteChannel(ctx context.Context, req *pb.DeleteChannelRequest) (*pb.DeleteChannelResponse, error) {
	if err := h.chatUC.DeleteChannel(ctx, req.ChannelId, req.UserId); err != nil {
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}
	return &pb.DeleteChannelResponse{Success: true}, nil
}

func (h *ChatHandler) GetChannelConversation(ctx context.Context, req *pb.GetChannelConversationRequest) (*pb.GetChannelConversationResponse, error) {
	convID, err := h.chatUC.GetChannelConversation(ctx, req.ChannelId)
	if err != nil {
		return nil, status.Error(codes.NotFound, err.Error())
	}
	return &pb.GetChannelConversationResponse{ConversationId: convID}, nil
}

// ── Üye & rol handler'ları ───────────────────────────────

func (h *ChatHandler) ListServerMembers(ctx context.Context, req *pb.ListServerMembersRequest) (*pb.ListServerMembersResponse, error) {
	members, err := h.chatUC.ListServerMembers(ctx, req.ServerId, req.RequesterId)
	if err != nil {
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}
	var pbMembers []*pb.ServerMemberInfo
	for _, m := range members {
		pbMembers = append(pbMembers, &pb.ServerMemberInfo{
			UserId:   m.UserID,
			Role:     string(m.Role),
			JoinedAt: m.JoinedAt.Format(time.RFC3339),
		})
	}
	return &pb.ListServerMembersResponse{Members: pbMembers}, nil
}

func (h *ChatHandler) SetMemberRole(ctx context.Context, req *pb.SetMemberRoleRequest) (*pb.SetMemberRoleResponse, error) {
	if err := h.chatUC.SetMemberRole(ctx, req.ServerId, req.RequesterId, req.TargetUserId, req.Role); err != nil {
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}
	return &pb.SetMemberRoleResponse{Success: true}, nil
}

func (h *ChatHandler) KickMember(ctx context.Context, req *pb.KickMemberRequest) (*pb.KickMemberResponse, error) {
	if err := h.chatUC.KickMember(ctx, req.ServerId, req.RequesterId, req.TargetUserId); err != nil {
		return nil, status.Error(codes.PermissionDenied, err.Error())
	}
	return &pb.KickMemberResponse{Success: true}, nil
}

// ── Yardımcı dönüştürücüler ──────────────────────────────

func serverToPb(s *entity.Server) *pb.Server {
	return &pb.Server{
		Id: s.ID, Name: s.Name, IconUrl: s.IconURL,
		OwnerId: s.OwnerID, InviteCode: s.InviteCode,
		CreatedAt: s.CreatedAt.Format(time.RFC3339),
	}
}

func channelToPb(ch *entity.Channel) *pb.Channel {
	return &pb.Channel{
		Id: ch.ID, ServerId: ch.ServerID, Name: ch.Name, Topic: ch.Topic,
		Type: ch.Type, Position: int32(ch.Position),
		ConversationId: ch.ConversationID,
		CreatedAt:      ch.CreatedAt.Format(time.RFC3339),
	}
}
