const IPFS = require('ipfs')
const { BufferList } = require('bl')
const { putObject } = require('./aws.js')

const main = async () => {
    const node = await IPFS.create()
    for await (const fileInfo of node.files.ls('/')) {
        console.log(fileInfo)
        for await (const file of ipfs.get(fileInfo.cid)) {
            console.log(file.path)
            if (!file.content) continue;
            const content = new BufferList()
            for await (const chunk of file.content) {
              content.append(chunk)
            }
            const response = await putObject('ipfs.exokit.org', file.name, content)
            console.log(response)
          }
    }
}
main()