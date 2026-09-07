'use server';

import {connectToDatabase} from "@/database/mongoose";

export const getUserContactById = async (id: string): Promise<{ id: string; email: string; name: string } | null> => {
    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) return null;
        // Better Auth stores its user id as the `id` field (string), _id is the ObjectId.
        const user =
            (await db.collection('user').findOne({ id })) ||
            (await db.collection('user').findOne({ _id: { $eq: id } as never }).catch(() => null));
        if (!user?.email) return null;
        return { id: user.id || String(user._id), email: user.email, name: user.name || 'there' };
    } catch (e) {
        console.error('getUserContactById error', e);
        return null;
    }
};

export const getAllUsersForNewsEmail = async () => {
    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if(!db) throw new Error('Mongoose connection not connected');

        const users = await db.collection('user').find(
            { email: { $exists: true, $ne: null }},
            { projection: { _id: 1, id: 1, email: 1, name: 1, country:1 }}
        ).toArray();

        return users.filter((user) => user.email && user.name).map((user) => ({
            id: user.id || user._id?.toString() || '',
            email: user.email,
            name: user.name
        }))
    } catch (e) {
        console.error('Error fetching users for news email:', e)
        return []
    }
}
