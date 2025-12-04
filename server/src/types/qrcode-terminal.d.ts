declare module 'qrcode-terminal' {
    interface QRCodeOptions {
        small?: boolean;
    }

    function generate(text: string, callback?: (code: string) => void): void;
    function generate(text: string, options: QRCodeOptions, callback?: (code: string) => void): void;

    export { generate };
}
