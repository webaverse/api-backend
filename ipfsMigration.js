const { putObject } = require('./aws.js')
const fetch = require('node-fetch');
const mime = require('mime');

const main = async () => {
    const listRes = await fetch('https://packages.exokit.org/')
    const list = await listRes.json()
    list.forEach(async (package) => {
        const detailsRes = await fetch(`https://packages.exokit.org/${package}`)
        const details = await detailsRes.json()
        const webBundle = await fetch(`https://ipfs.exokit.org/ipfs/${details.dataHash}`)
        const s3BundleRes = await putObject('ipfs.exokit.org', `${details.dataHash}.wbn`, webBundle.toString())
        details.icons.forEach(async (icon) => {
            const preview = await fetch(`https://ipfs.exokit.org/ipfs/${icon.hash}`)
            const s3IconRes = await putObject('ipfs.exokit.org', `${icon.hash}.${mime.getExtension(icon.type)}`, preview.toString())
        })
    })
}
main()