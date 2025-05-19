This folder contains custom modules that are used in Glue jobs. Here we already created a custom module called `src`.

Follow this guide by AWS to create custom modules to upload to Glue jobs.

[https://docs.aws.amazon.com/glue/latest/dg/add-job-python.html#create-python-extra-library](https://docs.aws.amazon.com/glue/latest/dg/add-job-python.html#create-python-extra-library)

## Create a `.whl` file

1. There is a `setup.py` file in the `src` folder. Run the following command to create a `.whl` file:

```bash
python setup.py bdist_wheel
```

2. The `.whl` file will be created in the `dist` folder.

Highly recommend to upload a `.whl` file. For example you can find the a file we created under `cdk/glue/custom_modules/src/dist/src-0.1-py3-none-any.whl`.

The .whl will be uploaded to the Glue job as a custom module during CDK deployment. However it can also be uploaded manually to the s3 bucket containing the Glue scripts.