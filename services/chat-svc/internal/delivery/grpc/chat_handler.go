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
		pbMsgs = append(pbMsgs, &pb.Message{
			Id:             m.ID,
			ConversationId: m.ConversationID,
			SenderId:       m.SenderID,
			Type:           string(m.Type),
			Content:        m.Content,
			Status:         string(m.Status),
			ReplyToId:      m.ReplyToID,
			CreatedAt:      m.CreatedAt.Format(time.RFC3339),
		})
	}

	return &pb.GetHistoryResponse{Messages: pbMsgs}, nil
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
