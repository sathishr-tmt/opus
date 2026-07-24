import mongoose from 'mongoose';

mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

let connectionPromise = null;
let listenersAttached = false;

function getMongoUri() {
  const uri = String(process.env.MONGODB_URI || '').trim();

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to backend/.env.'
    );
  }

  return uri;
}

function attachConnectionListeners() {
  if (listenersAttached) return;

  listenersAttached = true;

  mongoose.connection.on('disconnected', () => {
    connectionPromise = null;
    console.warn('MongoDB disconnected.');
  });

  mongoose.connection.on('error', (error) => {
    console.error(`MongoDB connection error: ${error.message}`);
  });
}

async function connectMongo() {
  attachConnectionListeners();

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = getMongoUri();

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
      minPoolSize: 0,
      autoIndex: process.env.NODE_ENV !== 'production'
    })
    .then(() => {
      console.log(
        `MongoDB connected successfully (${mongoose.connection.name}).`
      );

      return mongoose.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error(`Unable to connect to MongoDB: ${error.message}`);
      throw error;
    });

  return connectionPromise;
}

function getMongoConnection() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected.');
  }

  return mongoose.connection;
}

function getDb() {
  const connection = getMongoConnection();

  if (!connection.db) {
    throw new Error('MongoDB database handle is unavailable.');
  }

  return connection.db;
}

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

async function disconnectMongo() {
  if (mongoose.connection.readyState === 0) {
    connectionPromise = null;
    return;
  }

  try {
    await mongoose.disconnect();
  } finally {
    connectionPromise = null;
  }
}

export {
  connectMongo,
  disconnectMongo,
  getMongoConnection,
  getDb,
  isMongoReady
};