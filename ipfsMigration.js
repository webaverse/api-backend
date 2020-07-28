const { putObject } = require('./aws.js')
const fetch = require('node-fetch');
const mime = require('mime');

const main = async () => {
    try {
        const listRes = await fetch('https://packages.exokit.org/')
        const list = await listRes.json()
        list.forEach(async (package) => {
            const detailsRes = await fetch(`https://packages.exokit.org/${package}`)
            const details = await detailsRes.json()
            const webBundle = await fetch(`https://ipfs.exokit.org/ipfs/${details.dataHash}`)
            await putObject('ipfs.exokit.org', `${details.dataHash}.wbn`, new Buffer.from(await webBundle.arrayBuffer()))
            details.icons.forEach(async (icon) => {
                let ext = mime.getExtension(icon.type)
                if (!ext && (icon.type === 'model/gltf-binary+preview' || icon.type === 'model/gltf-binary')) {
                    ext = 'glb'
                }
                if (ext) {
                    const preview = await fetch(`https://ipfs.exokit.org/ipfs/${icon.hash}`)
                    await putObject('ipfs.exokit.org', `${icon.hash}.${ext}`, new Buffer.from(await preview.arrayBuffer()))
                }
                else {
                    console.log('File rejected, MIME type not accepted.', icon.type)
                }
            })
        })
    }
    catch (e) {
        console.log(e)
    }
}
main()