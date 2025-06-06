interface ResponseData {
    confidence: number;
    label: string;
    raw_prediction: number[];
    caption: string;
}

interface BaseFromWorker {
    status: 'init' | 'ongoing' | 'complete';
}
interface WorkerInit extends BaseFromWorker {
    status: 'init';
    message: string;
}
interface WorkerUpdate extends BaseFromWorker {
    status: 'ongoing';
    percent: number;
    message: string;
}
interface WorkerComplete extends BaseFromWorker {
    status: 'complete';
}
type FromWorker = WorkerInit | WorkerUpdate | WorkerComplete;

interface ToWorker {
    data: ResponseData[];
    files: FileWithHandle[];
    folder: FileSystemDirectoryHandle;
}

interface FileWithHandle {
    file: File;
    handle: FileSystemFileHandle;
}

export type { ResponseData, FromWorker, ToWorker, FileWithHandle };
