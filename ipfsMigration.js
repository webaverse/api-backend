const { putObject } = require('./aws.js')
const fetch = require('node-fetch');

const main = async () => {
    const listRes = await fetch('https://packages.exokit.org/')
    const list = await listRes.json()
    list.forEach(async (package) => {
        const detailsRes = await fetch(`https://packages.exokit.org/${package}`)
        const details = await detailsRes.json()
        const webBundle = await fetch(`https://ipfs.exokit.org/ipfs/${details.dataHash}`)
        console.log(webBundle)
        // upload to s3
        details.icons.forEach((icon) => {
            const preview = await fetch(`https://ipfs.exokit.org/ipfs/${icon.hash}`)
            console.log(preview)
            // upload to s3
        })
    })
}
main()