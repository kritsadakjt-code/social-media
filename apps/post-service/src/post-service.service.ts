import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post } from './post.schema';
import { Model } from 'mongoose';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Comment, CommentDocument } from './comment.schema';

@Injectable()
export class PostService implements OnModuleInit {
  constructor(
    @InjectModel(Post.name) private postModel: Model<Post>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
  }

  async createPost(data: {
    userId: string;
    username: string;
    content: string;
  }) {
    const newPost = new this.postModel({
      userId: data.userId,
      username: data.username,
      content: data.content,
    });

    const savedPost = await newPost.save();
    this.kafkaClient.emit('post_created', {
      postId: savedPost._id.toString(),
      authorId: savedPost.userId,
      content: savedPost.content,
      timestamp: savedPost.createdAt || new Date().toISOString(),
    });

    console.log(`บันทึกโพสต์สำเร็จ (ID: ${savedPost._id.toString()})`);
    return savedPost;
  }

  // ดึงโพสต์ทั้งหมด เรียงจากใหม่ไปเก่า
  async getPosts() {
    const posts = await this.postModel.find().sort({ createdAt: -1 }).exec();

    return {
      posts: posts.map((post) => ({
        id: post._id.toString(),
        userId: post.userId,
        username: post.username,
        content: post.content,
        likes: post.likes,
        createdAt: post.createdAt
          ? post.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  async getPostsByIds(ids: string[]) {
    const posts = await this.postModel
      .find({ _id: { $in: ids } })
      .sort({ createdAt: -1 })
      .exec();

    return {
      posts: posts.map((post) => ({
        id: post._id.toString(),
        userId: post.userId,
        username: post.username,
        content: post.content,
        likes: post.likes,
        createdAt: post.createdAt
          ? post.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  async getPostsByUserId(userId: string) {
    const posts = await this.postModel
      .find({ userId: userId })
      .sort({ createdAt: -1 })
      .exec();

    return {
      posts: posts.map((post) => ({
        id: post._id.toString(),
        userId: post.userId,
        username: post.username,
        content: post.content,
        likes: post.likes,
        createdAt: post.createdAt
          ? post.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  async likePost(postId: string, userId: string) {
    const updatedPost = await this.postModel.findByIdAndUpdate(
      postId,
      { $inc: { likes: 1 } }, //ไป +1
      { returnDocument: 'after' }, // return ข้อมูลที่เเก้ไข
    );
    if (!updatedPost) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'ไม่พบโพสต์นี้ในระบบ',
      });
    }

    this.kafkaClient.emit('post_liked', {
      postId: updatedPost._id.toString(),
      postOwnerId: updatedPost.userId, // เจ้าของโพสต์ (คนที่จะโดนแจ้งเตือน)
      likedByUserId: userId, // คนที่ไปกดไลก์
      timestamp: new Date().toISOString(),
    });

    return {
      id: updatedPost._id.toString(),
      userId: updatedPost.userId,
      username: updatedPost.username,
      content: updatedPost.content,
      likes: updatedPost.likes,
      createdAt:
        updatedPost.createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  async addComment(data: {
    postId: string;
    userId: string;
    username: string;
    content: string;
  }) {
    // check ว่ามีโพสต์นี้มั้ย
    const post = await this.postModel.findById(data.postId);
    if (!post) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'ไม่พบโพสต์นี้ในระบบ',
      });
    }

    const newComment = new this.commentModel({
      postId: data.postId,
      userId: data.userId,
      username: data.username,
      content: data.content,
    });

    const savedComment = await newComment.save();

    this.kafkaClient.emit('post_commented', {
      postId: data.postId,
      postOwnerId: post.userId, // เจ้าของโพสต์ (คนที่จะโดนแจ้งเตือน)
      commenterId: data.userId, // คนที่มาคอมเมนต์
      commenterName: data.username,
      content: data.content,
      timestamp: savedComment.createdAt?.toISOString(),
    });

    return {
      id: savedComment._id.toString(),
      postId: savedComment.postId,
      userId: savedComment.userId,
      username: savedComment.username,
      content: savedComment.content,
      createdAt: savedComment.createdAt?.toISOString(),
    };
  }

  async getCommentsByPostId(postId: string) {
    const comment = await this.commentModel
      .find({ postId: postId })
      .sort({ createdAt: 1 })
      .exec();

    return {
      comment: comment.map((c) => ({
        id: c._id.toString(),
        postId: c.postId,
        userId: c.userId,
        username: c.username,
        content: c.content,
        createdAt: c.createdAt?.toISOString(),
      })),
    };
  }
}
