/**
 * Firestore Service for syncing approved prompts to Google Cloud Firestore
 */
import { Firestore } from '@google-cloud/firestore';
import type { Prompt, PromptVersion } from '@shared/schema';

// Initialize Firestore
let firestoreClient: Firestore | null = null;

function getFirestoreClient(): Firestore {
  if (!firestoreClient) {
    const projectId = process.env.FIRESTORE_PROJECT_ID;
    const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (!projectId) {
      throw new Error('FIRESTORE_PROJECT_ID environment variable is not set');
    }
    
    firestoreClient = new Firestore({
      projectId,
      keyFilename: keyFilePath,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
  }
  return firestoreClient;
}

/**
 * Sync an approved prompt to Firestore
 */
export async function syncPromptToFirestore(
  prompt: Prompt,
  version: PromptVersion,
  slug: string
): Promise<void> {
  const collectionName = process.env.FIRESTORE_COLLECTION || 'prompts';
  const db = getFirestoreClient();
  
  const docRef = db.collection(collectionName).doc(slug);
  
  // Extract variables from content (looking for {{variable_name}} patterns)
  const variableMatches = version.content.match(/\{\{(\w+)\}\}/g) || [];
  const variables = [...new Set(variableMatches.map(v => v.replace(/[{}]/g, '')))];
  
  const firestoreData = {
    slug,
    name: prompt.name,
    description: prompt.description || '',
    content: version.content,
    version: version.version,
    category: prompt.category,
    environment: prompt.environment,
    variables,
    status: 'approved',
    updatedAt: new Date().toISOString(),
    promptId: prompt.id,
    versionId: version.id,
  };
  
  await docRef.set(firestoreData, { merge: true });
  console.log(`✓ Synced prompt "${slug}" to Firestore`);
}

/**
 * Delete a prompt from Firestore
 */
export async function deletePromptFromFirestore(slug: string): Promise<void> {
  const collectionName = process.env.FIRESTORE_COLLECTION || 'prompts';
  const db = getFirestoreClient();
  
  await db.collection(collectionName).doc(slug).delete();
  console.log(`✓ Deleted prompt "${slug}" from Firestore`);
}

/**
 * List all prompts in Firestore
 */
export async function listPromptsFromFirestore(): Promise<any[]> {
  const collectionName = process.env.FIRESTORE_COLLECTION || 'prompts';
  const db = getFirestoreClient();
  
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
