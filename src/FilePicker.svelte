<script lang="ts">
    import { Client, handle_file } from '@gradio/client';
    import type {
        FileWithHandle,
        FromWorker,
        ResponseData,
        ToWorker,
    } from './types';

    let app = $state<Client | null>(null);
    let isLoading = $derived(app === null);

    let predictionProgress = $state(0);
    let renamingProgress = $state(0);

    type Status =
        | 'initializing'
        | 'idle'
        | 'uploading'
        | 'predicting'
        | 'renaming'
        | 'errored';
    let currentStatus = $state<Status>('initializing');
    let cancel = $state<() => Promise<void>>();

    let lastDataRecieved = $state<ResponseData[][] | null>(null);

    let worker = $state(
        new Worker(new URL('worker.ts', import.meta.url), { type: 'module' })
    );
    worker.onmessage = (ev) => {
        const evData = ev.data as FromWorker;
        switch (evData.status) {
            case 'init':
                console.log('Background worker started.');
                break;
            case 'ongoing':
                renamingProgress = evData.percent;
                break;
            case 'complete':
                console.log('All files renamed.');
                currentStatus = 'idle';
        }
    };

    async function main() {
        // wake the endpoint up on startup
        try {
            currentStatus = 'initializing';
            // TODO: Figure out why Client.duplicate isn't working
            const client = await Client.connect('winnet101/CMA-gradio-v1', {
                events: ['data', 'status'],
                // hf_token: import.meta.env.VITE_HUGGINGFACE_KEY,
            });
            app = client;
            currentStatus = 'idle';
        } catch (e) {
            console.error(e);
            currentStatus = 'errored';
        }
    }
    main();

    async function getFilesFromFolder() {
        if ('showDirectoryPicker' in window) {
            const folderHandle = await window.showDirectoryPicker();

            const fileHandles: FileWithHandle[] = [];
            for await (const [name, handle] of folderHandle.entries()) {
                if (handle.kind === 'file') {
                    const file = await handle.getFile();
                    if (file.type.includes('image')) {
                        fileHandles.push({
                            file: file,
                            handle: handle,
                        });
                    } else {
                        console.warn(
                            `Skipping file ${name} that's not an image.`
                        );
                    }
                }
            }

            return [fileHandles, folderHandle] as const;
        } else {
            throw new Error(
                "showDirectoryPicker isn't supported on your browser."
            );
        }
    }

    async function predict() {
        if (app === null) {
            throw new Error("The backend hasn't loaded yet.");
        }

        predictionProgress = 0;
        renamingProgress = 0;

        const [files, folder] = await getFilesFromFolder();
        folder.requestPermission({ mode: 'readwrite' });

        console.log('Loading predictions...');
        const input = files.map((f, i) => ({
            image: handle_file(f.file),
            caption: `${i}`,
        }));

        currentStatus = 'uploading';
        // const prediction = await app.predict('/predict', [input]);
        // TODO: Consider batching predictions
        const submission = app.submit('/predict', [input]);
        cancel = submission.cancel;

        // Await lastDataRecieved and update loading bar
        for await (const msg of submission) {
            if (msg.type === 'status') {
                console.log('Status updated.');
                currentStatus = 'predicting';
                if (msg.progress_data?.[0].progress) {
                    predictionProgress = msg.progress_data[0].progress;
                }
                if (msg.stage === 'complete') {
                    predictionProgress = 1;
                }
            } else if (msg.type === 'data') {
                console.log('Data updated.');
                lastDataRecieved = msg.data as ResponseData[][];
            }
        }

        // const data_wrapper = prediction.data as ResponseData[][];
        cancel = undefined;
        const data_wrapper = lastDataRecieved;
        if (data_wrapper === null) throw new Error('No data recieved.');

        console.log('Predictions recieved.');
        currentStatus = 'uploading';

        const data = data_wrapper[0];
        worker.postMessage({
            data: JSON.parse(JSON.stringify(data)),
            files: files,
            folder: folder,
        } as ToWorker);
    }
</script>

<div class="container">
    <button
        class="main-button"
        disabled={isLoading && currentStatus !== 'idle'}
        onclick={predict}
    >
        Choose a folder
    </button>

    <sub class="status-text">
        {#if isLoading}
            Loading...
        {/if}
    </sub>

    <div class="status-text">
        <span class="status-indicator {currentStatus}"></span>
        Currently {currentStatus}
    </div>

    <div class="progress-container">
        <label>Prediction Progress:</label>
        <progress class="prediction-progress" value={predictionProgress} max={1}
        ></progress>
        <div class="progress-text">
            {(predictionProgress * 100).toFixed(2)}% loaded
        </div>
    </div>

    <div class="progress-container">
        <label>Renaming Progress:</label>
        <progress class="renaming-progress" value={renamingProgress} max={1}
        ></progress>
        <div class="progress-text">
            {(renamingProgress * 100).toFixed(2)}% renamed
        </div>
    </div>

    <button
        class="cancel-button"
        disabled={cancel === undefined}
        onclick={cancel}
    >
        Cancel
    </button>
</div>

<style>
    .container {
        max-width: 600px;
        margin: 2rem auto;
        padding: 2rem;
        border-radius: 8px;
        background-color: #ffffff;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .main-button,
    .cancel-button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .main-button {
        background-color: #4caf50;
        color: white;
        width: 100%;
        margin-bottom: 1rem;
    }

    .main-button:hover:not(:disabled) {
        background-color: #45a049;
    }

    .main-button:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
    }

    .cancel-button {
        background-color: #f44336;
        color: white;
        margin-top: 1rem;
    }

    .cancel-button:hover:not(:disabled) {
        background-color: #da190b;
    }

    .cancel-button:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
    }

    .progress-container {
        margin: 1.5rem 0;
    }

    .progress-container label {
        display: block;
        margin-bottom: 0.5rem;
        color: #666;
        font-size: 0.9rem;
    }

    progress {
        width: 100%;
        height: 12px;
        border-radius: 6px;
        -webkit-appearance: none;
        appearance: none;
    }

    progress::-webkit-progress-bar {
        background-color: #f0f0f0;
        border-radius: 6px;
    }

    progress::-webkit-progress-value {
        background-color: #2196f3;
        border-radius: 6px;
        transition: width 0.2s ease;
    }

    .progress-text {
        margin-top: 0.5rem;
        font-size: 0.9rem;
        color: #666;
    }

</style>
