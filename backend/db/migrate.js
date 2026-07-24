// OPUS MongoDB setup runner.
// MongoDB creates collections dynamically; this command ensures every
// collection and index exists and safely seeds default editable permissions.
// Usage from project root: npm run db:migrate --prefix backend

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  connectMongo,
  disconnectMongo
} from '../src/mongo.js';

import {
  mongoModels,
  RolePermission
} from '../src/models.js';

import {
  DEFAULT_EDITABLE_PERMISSIONS
} from '../src/permissions.js';

export async function runMigrations() {
  await connectMongo();

  const results = [];

  for (const model of mongoModels) {
    await model.createCollection();
    await model.createIndexes();

    results.push({
      collection:
        model.collection.collectionName,
      status: 'ready'
    });
  }

  for (
    const [role, permissions] of
    Object.entries(
      DEFAULT_EDITABLE_PERMISSIONS
    )
  ) {
    await RolePermission.updateOne(
      {
        role
      },
      {
        $setOnInsert: {
          _id: role,
          role,
          permissions,
          updatedBy: null,
          updatedAt: new Date()
        }
      },
      {
        upsert: true,
        runValidators: true
      }
    );
  }

  return results;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const results =
      await runMigrations();

    for (const result of results) {
      console.log(
        `${result.status}: ${result.collection}`
      );
    }

    console.log(
      'MongoDB setup complete.'
    );
  } finally {
    await disconnectMongo().catch(
      () => {}
    );
  }
}