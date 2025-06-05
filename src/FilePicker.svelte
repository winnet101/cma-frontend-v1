<script lang="ts">
    import { Client, handle_file } from '@gradio/client';

    let app = $state<Client | null>(null);
    let isLoading = $derived(app === null);

    // let progress = $state(0);
    // let lastDataRecieved = $state<ResponseData[][] | null>(null);

    interface ResponseData {
        confidence: number;
        label: string;
        raw_prediction: number[];
    }

    async function main() {
        // wake the endpoint up on startup
        const client = await Client.connect('winnet101/CMA-gradio-v1', {
            events: ['data', 'status'],
        });

        app = client;
    }
    main();

    async function getFilesFromFolder() {
        if ('showDirectoryPicker' in window) {
            const folder = await window.showDirectoryPicker();

            const files: File[] = [];
            for await (const [name, item] of folder.entries()) {
                if (item.kind === 'file') {
                    const f = await item.getFile();
                    if (f.type.includes('image')) {
                        files.push(f);
                    } else {
                        console.warn(
                            `Skipping file ${name} that's not an image.`
                        );
                    }
                }
            }

            return [files, folder] as const;
        } else {
            throw new Error(
                "showDirectoryPicker isn't supported on your browser."
            );
        }
    }

    async function renameFile(
        entry: FileSystemFileHandle | File,
        folder: FileSystemDirectoryHandle,
        newName: string
    ) {
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

    async function predict() {
        if (app === null) {
            throw new Error("The backend hasn't loaded yet.");
        }

        const [files, folder] = await getFilesFromFolder();
        const input = files.map((f) => ({
            image: handle_file(f),
            caption: 'None',
        }));

        console.log(input);

        console.log('Loading predictions...');
        const prediction = await app.predict('/predict', [input]);

        // for await (const msg of submission) {
        //     if (msg.type === 'status') {
        //         console.log('Status updated.');
        //         console.log(msg);
        //     } else if (msg.type === 'data') {
        //         console.log('Data updated.');
        //         console.log(msg);
        //         lastDataRecieved = msg.data as ResponseData[][];
        //     }
        // }

        console.log('Predictions recieved.');

        const data_wrapper = prediction.data as ResponseData[][];
        // const data_wrapper = lastDataRecieved;
        const data = data_wrapper[0];

        console.log('Renaming files.')
        const renameCallbacks: Promise<void>[] = [];
        data.forEach((data, i) => {
            const fileExtension = files[i].name.split('.').pop();
            console.log(fileExtension);
            renameCallbacks.push(
                renameFile(
                    files[i],
                    folder,
                    `${data.label}${crypto.randomUUID()}.${fileExtension}`
                )
            );
        });

        await Promise.allSettled(renameCallbacks);
        console.log('Files renamed.')
    }
</script>

<button disabled={isLoading} onclick={predict}>Choose a folder</button>
<sub>
    {#if isLoading}
        Loading...
    {/if}
</sub>

<!-- <progress value={progress} max={100}></progress> -->
<!-- <div>{progress}</div> -->
