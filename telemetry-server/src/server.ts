import express from 'express';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
let client: MongoClient;

async function connectToMongo() {
    try {
        client = new MongoClient(mongoUri!);
        await client.connect();
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

// API endpoints
app.post('/telemetry', async (req, res) => {
    try {
        const db = client.db('telemetry');
        const collection = db.collection('events');
        
        const telemetryData = {
            ...req.body,
            timestamp: new Date(),
            receivedAt: new Date()
        };

        await collection.insertOne(telemetryData);
        res.status(200).json({ message: 'Telemetry data received' });
    } catch (error) {
        console.error('Error saving telemetry:', error);
        res.status(500).json({ error: 'Failed to save telemetry data' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
connectToMongo().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});