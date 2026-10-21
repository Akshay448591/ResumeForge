import { Schema, model } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);
