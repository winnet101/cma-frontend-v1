import type { FromWorker, ToWorker } from './types';

function sendMessage(data: FromWorker) {
    postMessage(data);
}

sendMessage({
    status: 'init',
    message: 'Hello world!',
});

onmessage = async (event) => {
    const eventData = event.data as ToWorker;
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(eventData.data.length / BATCH_SIZE);
    let completedFiles = 0;

    // Process all files in parallel batches
    const batchPromises = Array.from({ length: totalBatches }, async (_, batchIndex) => {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, eventData.data.length);
        const currentBatch = eventData.data.slice(start, end);

        const batchOperations = currentBatch.map(async (prediction, i) => {
            const fileIndex = start + i;
            const fileExtension = eventData.files[fileIndex].file.name
                .split('.')
                .pop();
            const fileName = `${
                prediction.label
            }-${crypto.randomUUID()}.${fileExtension}`;

            await renameFile(
                eventData.files[fileIndex].handle,
                eventData.folder,
                fileName
            );

            // Update progress after each file
            completedFiles++;
            sendMessage({
                status: 'ongoing',
                percent: completedFiles / eventData.data.length,
                message: `Renamed ${completedFiles} of ${eventData.data.length} files`,
            });
        });

        // Process each batch concurrently
        await Promise.all(batchOperations);
    });

    // Wait for all batches to complete
    await Promise.all(batchPromises);

    sendMessage({
        status: 'complete',
    });
};

async function renameFile(
    entry: FileSystemFileHandle,
    folder: FileSystemDirectoryHandle,
    newName: string
) {
    if ('move' in entry) {
        // @ts-ignore
        await entry.move(folder, newName);
        return;
    }

    // Get the file contents
    const file = entry instanceof File ? entry : await entry.getFile();
    const contents = await file.arrayBuffer();

    // Create a new file with the new name
    const newHandle = await folder.getFileHandle(newName, { create: true });
    const writable = await newHandle.createWritable();
    await writable.write(contents);
    await writable.close();

    // Delete the old file
    await folder.removeEntry(entry.name);
}
