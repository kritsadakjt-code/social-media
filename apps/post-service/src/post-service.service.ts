import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post } from './post.schema';
import { Model } from 'mongoose';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Comment, CommentDocument } from './comment.schema';
import { PostCreatedSchema, PostLikedSchema, registry } from '@app/shared';
import { SchemaType } from '@kafkajs/confluent-schema-registry';
import { PostCommentedSchema } from '@app/shared/kafka/schemas/posts/commented-post.schema';

@Injectable()
export class PostService implements OnModuleInit {
  private postCreatedSchemaId!: number;
  private postLikedSchemaId!: number;
  private postCommentSchemaId!: number;

  constructor(
    @InjectModel(Post.name) private postModel: Model<Post>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();

    // ไปขอ schemaID เเค่ครั้งเดียวเเละจําไปตลอด ตอน start service เเก้จากที่ต้องยิงเข้ามาทีละครั้ง
    try {
      const postCreated = await registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(PostCreatedSchema),
      });
      this.postCreatedSchemaId = postCreated.id;

      const postLiked = await registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(PostLikedSchema),
      });
      this.postLikedSchemaId = postLiked.id;

      const postComment = await registry.register({
        type: SchemaType.AVRO,
        schema: JSON.stringify(PostCommentedSchema),
      });
      this.postCommentSchemaId = postComment.id;

      console.log('✅ โหลด Schema ลง Memory สำเร็จ!');
    } catch (error) {
      console.error('❌ โหลด Schema ไม่สำเร็จ:', error);
    }
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

    const rawData = {
      postId: savedPost._id.toString(),
      authorId: savedPost.userId,
      content: savedPost.content,
      timestamp: savedPost.createdAt
        ? new Date(savedPost.createdAt).toISOString()
        : new Date().toISOString(),
      // imageUrl: 'https://example.com/my-awesome-photo.jpg',
      // imageUrl2: 'https://example.com/my-awesome-photo2.jpg',
    };

    try {
      const encodedPayload = await registry.encode(
        this.postCreatedSchemaId,
        rawData,
      );
      this.kafkaClient.emit('post_events', {
        key: savedPost._id.toString(),
        value: encodedPayload,
        headers: {
          event_type: 'post_created',
        },
      });
      console.log(`✅ ส่งข้อความ Post Created ผ่าน Schema Registry สำเร็จ!`);
    } catch (error) {
      console.error('❌ ไม่สามารถส่งข้อความ post_created ได้:', error);
    }

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

  async getPostsByUserId(userId: string): Promise<{ ids: string[] }> {
    const posts = await this.postModel.find({ userId }).select('_id').exec();

    return {
      ids: posts.map((post) => post._id.toString()),
    };
  }

  // async likePost(postId: string, userId: string) {
  //   const updatedPost = await this.postModel.findByIdAndUpdate(
  //     postId,
  //     { $inc: { likes: 1 } }, //ไป +1
  //     { returnDocument: 'after' }, // return ข้อมูลที่เเก้ไข
  //   );
  //   if (!updatedPost) {
  //     throw new RpcException({
  //       code: status.NOT_FOUND,
  //       message: 'ไม่พบโพสต์นี้ในระบบ',
  //     });
  //   }

  //   const rawData = {
  //     postId: updatedPost._id.toString(),
  //     postOwnerId: updatedPost.userId, // เจ้าของโพสต์ (คนที่จะโดนแจ้งเตือน)
  //     likedByUserId: userId, // คนที่ไปกดไลก์
  //     timestamp: new Date().toISOString(),
  //   };
  //   try {
  //     const encodedPayload = await registry.encode(
  //       this.postLikedSchemaId,
  //       rawData,
  //     );
  //     this.kafkaClient.emit('post_events', {
  //       key: postId,
  //       value: encodedPayload,
  //       headers: {
  //         event_type: 'post_liked',
  //       },
  //     });
  //     console.log(`✅ ส่งข้อความ Post Liked ผ่าน Schema Registry สำเร็จ!`);
  //   } catch (error) {
  //     console.error('❌ ไม่สามารถส่งข้อความ post_liked ได้:', error);
  //   }

  //   return {
  //     id: updatedPost._id.toString(),
  //     userId: updatedPost.userId,
  //     username: updatedPost.username,
  //     content: updatedPost.content,
  //     likes: updatedPost.likes,
  //     createdAt:
  //       updatedPost.createdAt?.toISOString() || new Date().toISOString(),
  //   };
  // }

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

    const rawData = {
      postId: data.postId,
      postOwnerId: post.userId, // เจ้าของโพสต์ (คนที่จะโดนแจ้งเตือน)
      commenterId: data.userId, // คนที่มาคอมเมนต์
      commenterName: data.username,
      content: data.content,
      timestamp: savedComment.createdAt?.toISOString(),
    };
    console.log(this.postCommentSchemaId);
    try {
      const encodePayload = await registry.encode(
        this.postCommentSchemaId,
        rawData,
      );
      this.kafkaClient.emit('post_events', {
        key: data.postId,
        value: encodePayload,
        headers: {
          event_type: 'post_commented',
        },
      });
      console.log(`✅ ส่งข้อความ Post Comment ผ่าน Schema Registry สำเร็จ!`);
    } catch (error) {
      console.error('❌ ไม่สามารถส่งข้อความ post_comment ได้:', error);
    }

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
    const comments = await this.commentModel
      .find({ postId: postId })
      .sort({ createdAt: 1 })
      .exec();

    return {
      comments: comments.map((c) => ({
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
