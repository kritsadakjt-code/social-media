import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post } from './post.schema';
import { Model } from 'mongoose';

@Injectable()
export class PostService {
  constructor(@InjectModel(Post.name) private postModel: Model<Post>) {}

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
    console.log(`บันทึกโพสต์สำเร็จ (ID: ${savedPost._id.toString()})`);
    return savedPost;
  }
}
